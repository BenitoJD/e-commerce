const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { releaseItems, reserveItems, withTransaction } = require('../lib/stock');
const { verifySignature, amountMatches } = require('../lib/orderTransitions');
const { webhookMode } = require('../lib/webhookAuth');
const { releaseCouponUse } = require('../lib/couponRelease');
const { notifyOrder } = require('../lib/notify');

const router = express.Router();

// NOTE: mounted with express.raw({ type: '*/*' }) in index.js so req.body is a Buffer.

const STOCK_HOLDING = ['pending', 'paid', 'cod_pending'];

// Razorpay retries deliveries and can deliver duplicates concurrently. The event id (or a
// hash of the body for older payloads) is claimed exactly once; everything below is also
// transactional with the order row locked, so a replayed `payment.failed` cannot restock
// the same unit twice.
async function claimEvent(event, raw) {
  const id = String(event.id || '').trim() || crypto.createHash('sha256').update(raw).digest('hex');
  const { rows } = await db.query(
    'INSERT INTO webhook_events (id, event) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id',
    [id, String(event.event || '')]
  );
  return { id, first: rows.length > 0 };
}

router.post('/razorpay', async (req, res) => {
  let claimed = null;
  try {
    const mode = webhookMode(process.env);
    if (mode === 'error') {
      // Fail closed: without a real secret anyone could fake a payment event.
      console.error('[webhook] rejected: RAZORPAY_WEBHOOK_SECRET is missing or a placeholder');
      return res.status(503).json({ ok: false, error: 'Webhook verification is not configured' });
    }

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const signature = req.headers['x-razorpay-signature'] || '';
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

    if (mode === 'verify') {
      if (!verifySignature(raw, signature, secret)) {
        console.log('[webhook] invalid signature');
        return res.status(400).json({ ok: false, error: 'Invalid signature' });
      }
    } else {
      console.log('[webhook] skipping signature check (development without a secret)');
    }

    let event;
    try {
      event = JSON.parse(raw.toString('utf8') || '{}');
    } catch {
      console.log('[webhook] malformed JSON');
      return res.status(400).json({ ok: false, error: 'Malformed payload' });
    }
    console.log('[webhook] event:', event.event);

    const entity = (event.payload && (event.payload.payment || event.payload.refund || {}).entity) || {};
    const rzpOrderId = entity.order_id || null;
    const rzpPaymentId = entity.id || null;
    if (!rzpOrderId) {
      console.log('[webhook] no order_id, acking');
      return res.json({ ok: true });
    }

    claimed = await claimEvent(event, raw);
    if (!claimed.first) {
      console.log(`[webhook] duplicate event ${claimed.id} ignored`);
      return res.json({ ok: true, duplicate: true });
    }

    const outcome = await withTransaction(async (tx) => {
      const { rows } = await tx.query(
        'SELECT id, receipt, status, amount_paise, items, coupon_code, customer, customer_email, pay_mode, refunded_paise FROM orders WHERE razorpay_order_id = $1 FOR UPDATE',
        [rzpOrderId]
      );
      if (!rows.length) return { ack: true, note: 'unknown razorpay order' };
      const order = rows[0];
      const from = String(order.status || '');
      const eventName = String(event.event || '');
      const paymentAmountMatches = amountMatches(order.amount_paise, entity.amount);

      if (eventName === 'payment.captured') {
        if (!paymentAmountMatches) {
          console.log(`[webhook] captured amount mismatch on ${order.receipt}, manual review`);
          return { ack: true, note: 'amount mismatch' };
        }
        if (from === 'pending') {
          await tx.query(
            "UPDATE orders SET status = 'paid', razorpay_payment_id = $1 WHERE id = $2",
            [rzpPaymentId, order.id]
          );
          await notifyOrder(tx, { ...order, status: 'paid' }, 'paid');
          return { ack: true, note: 'paid' };
        }
        if (from === 'failed') {
          // A retried payment can capture after the first attempt released stock. Re-reserve
          // before marking it paid; if the goods are gone, keep the money but mark it for a
          // manual refund instead of silently overselling.
          try {
            await reserveItems(tx, Array.isArray(order.items) ? order.items : []);
            await tx.query(
              "UPDATE orders SET status = 'paid', razorpay_payment_id = $1 WHERE id = $2",
              [rzpPaymentId, order.id]
            );
            await notifyOrder(tx, order, 'paid');
            return { ack: true, note: 'paid (stock re-reserved)' };
          } catch (err) {
            if (err.code !== 'INSUFFICIENT_STOCK') throw err;
            await tx.query(
              "UPDATE orders SET status = 'refunded', razorpay_payment_id = $1, refund_mode = 'manual', refunded_at = NOW(), refunded_paise = amount_paise WHERE id = $2",
              [rzpPaymentId, order.id]
            );
            return { ack: true, note: 'captured after failure with no stock, manual refund required' };
          }
        }
        if (from === 'cancelled' || from === 'refunded') {
          // The shopper was charged after cancelling/sweeping the order. Record the payment
          // and flag a manual refund; acking without a trace was a money-loss path.
          await tx.query(
            "UPDATE orders SET razorpay_payment_id = $1, refund_mode = 'manual', refunded_at = COALESCE(refunded_at, NOW()) WHERE id = $2",
            [rzpPaymentId, order.id]
          );
          return { ack: true, note: 'late capture on cancelled order, manual refund flagged' };
        }
        await tx.query(
          'UPDATE orders SET razorpay_payment_id = COALESCE($1, razorpay_payment_id) WHERE id = $2',
          [rzpPaymentId, order.id]
        );
        return { ack: true, note: `already ${from}` };
      }

      if (eventName === 'payment.failed') {
        if (from !== 'pending') return { ack: true, note: `already ${from}, ignoring failure` };
        await tx.query("UPDATE orders SET status = 'failed' WHERE id = $1", [order.id]);
        await releaseItems(tx, Array.isArray(order.items) ? order.items : []);
        await releaseCouponUse(tx, order.coupon_code, 'pending');
        return { ack: true, note: 'failed (stock + coupon released)' };
      }

      if (eventName === 'refund.processed') {
        const refundPaise = Math.max(0, Number(entity.amount) || 0);
        if (!refundPaise) return { ack: true, note: 'refund has no amount' };
        if (from === 'cancelled' || from === 'refunded') {
          await tx.query(
            'UPDATE orders SET refunded_paise = GREATEST(refunded_paise, $1) WHERE id = $2',
            [Math.min(refundPaise, order.amount_paise), order.id]
          );
          return { ack: true, note: `already ${from}` };
        }
        const totalRefunded = Math.max(0, Number(order.refunded_paise) || 0) + refundPaise;
        if (totalRefunded < Number(order.amount_paise)) {
          // Partial refund: the sale is still open and the goods are not restocked.
          await tx.query('UPDATE orders SET refunded_paise = $1 WHERE id = $2', [totalRefunded, order.id]);
          return { ack: true, note: `partial refund ${totalRefunded}/${order.amount_paise}` };
        }
        await tx.query(
          "UPDATE orders SET status = 'refunded', refunded_paise = amount_paise, refunded_at = NOW(), refund_mode = COALESCE(refund_mode, 'auto') WHERE id = $1",
          [order.id]
        );
        if (STOCK_HOLDING.includes(from)) {
          await releaseItems(tx, Array.isArray(order.items) ? order.items : []);
        }
        await releaseCouponUse(tx, order.coupon_code, from);
        await notifyOrder(tx, order, 'refunded');
        return { ack: true, note: 'refunded' };
      }

      if (eventName === 'refund.created') {
        // Money has not moved yet; wait for refund.processed to change the order.
        return { ack: true, note: 'refund created (awaiting processed)' };
      }

      return { ack: true, note: 'unhandled event' };
    });

    if (outcome.note) console.log(`[webhook] ${event.event}: ${outcome.note}`);
    res.json({ ok: true });
  } catch (err) {
    // Release the claim so Razorpay's retry can process the event after a transient error.
    if (claimed && claimed.first) {
      await db.query('DELETE FROM webhook_events WHERE id = $1', [claimed.id]).catch(() => {});
    }
    console.error('[webhook] error:', err.message);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
