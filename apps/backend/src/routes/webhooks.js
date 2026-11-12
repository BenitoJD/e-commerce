const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

// NOTE: mounted with express.raw({ type: '*/*' }) in index.js so req.body is a Buffer.

// POST /webhooks/razorpay
router.post('/razorpay', async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const signature = req.headers['x-razorpay-signature'] || '';
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

    if (secret && !secret.includes('placeholder')) {
      const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
      if (expected !== signature) {
        console.log('[webhook] invalid signature');
        return res.status(400).json({ ok: false, error: 'Invalid signature' });
      }
    } else {
      console.log('[webhook] skipping signature check (placeholder secret)');
    }

    const event = JSON.parse(raw.toString('utf8') || '{}');
    console.log('[webhook] event:', event.event);

    const entity = (event.payload && (event.payload.payment || event.payload.refund || {}).entity) || {};
    const rzpOrderId = entity.order_id || null;
    const rzpPaymentId = entity.id || null;

    if (event.event === 'payment.captured' && rzpOrderId) {
      await db.query(
        `UPDATE orders SET status = 'paid', razorpay_payment_id = COALESCE($1, razorpay_payment_id) WHERE razorpay_order_id = $2`,
        [rzpPaymentId, rzpOrderId]
      );
      console.log(`[webhook] payment.captured -> paid ${rzpOrderId}`);
    } else if (event.event === 'payment.failed' && rzpOrderId) {
      await db.query(`UPDATE orders SET status = 'failed' WHERE razorpay_order_id = $1`, [rzpOrderId]);
      console.log(`[webhook] payment.failed -> failed ${rzpOrderId}`);
    } else if ((event.event === 'refund.processed' || event.event === 'refund.created') && rzpOrderId) {
      await db.query(`UPDATE orders SET status = 'refunded' WHERE razorpay_order_id = $1`, [rzpOrderId]);
      console.log(`[webhook] refund -> refunded ${rzpOrderId}`);
    } else {
      console.log('[webhook] unhandled event, acking');
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[webhook] error:', err.message);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
