const express = require('express');
const db = require('../db');
const { releaseItems } = require('../lib/stock');
const { verifySignature, amountMatches, decideTransition } = require('../lib/orderTransitions');
const { webhookMode } = require('../lib/webhookAuth');

const router = express.Router();

// NOTE: mounted with express.raw({ type: '*/*' }) in index.js so req.body is a Buffer.

// POST /webhooks/razorpay
router.post('/razorpay', async (req, res) => {
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

    const { rows } = await db.query(
      'SELECT id, receipt, status, amount_paise, items FROM orders WHERE razorpay_order_id = $1',
      [rzpOrderId]
    );
    if (!rows.length) {
      console.log('[webhook] unknown razorpay order, acking:', rzpOrderId);
      return res.json({ ok: true });
    }
    const order = rows[0];

    const decision = decideTransition(
      order.status,
      event.event,
      amountMatches(order.amount_paise, entity.amount)
    );
    if (!decision.to) {
      console.log(`[webhook] ${event.event} on ${order.receipt}: ${decision.reason || 'no change'}`);
      return res.json({ ok: true });
    }

    await db.query(
      `UPDATE orders SET status = $1, razorpay_payment_id = COALESCE($2, razorpay_payment_id) WHERE id = $3`,
      [decision.to, rzpPaymentId, order.id]
    );
    if (decision.release) {
      await releaseItems(db, Array.isArray(order.items) ? order.items : []);
    }
    console.log(`[webhook] ${event.event} -> ${order.receipt} now ${decision.to}${decision.release ? ' (stock released)' : ''}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[webhook] error:', err.message);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
