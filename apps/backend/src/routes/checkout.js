const express = require('express');
const Razorpay = require('razorpay');
const db = require('../db');
const { applyCoupon } = require('../lib/pricing');

const router = express.Router();

function razorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  if (!keyId || !keySecret || keyId.includes('placeholder') || keySecret.includes('placeholder')) {
    return null; // local dev: use mock
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// POST /store/checkout/create
router.post('/create', async (req, res) => {
  try {
    const { items, customer, payMode } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items[] with {slug, qty} required' });
    }
    if (!customer || !customer.name || !customer.phone) {
      return res.status(400).json({ error: 'customer {name, phone} required' });
    }

    // Lookup products
    const slugs = [...new Set(items.map((i) => i.slug))];
    const { rows: found } = await db.query(
      `SELECT slug, price_paise, stock FROM products WHERE slug = ANY($1)`,
      [slugs]
    );
    const bySlug = Object.fromEntries(found.map((p) => [p.slug, p]));

    let amount = 0;
    const lineItems = [];
    for (const it of items) {
      const p = bySlug[it.slug];
      if (!p) return res.status(400).json({ error: `Unknown product slug: ${it.slug}` });
      const qty = parseInt(it.qty, 10) || 0;
      if (qty < 1) return res.status(400).json({ error: `Invalid qty for ${it.slug}` });
      amount += p.price_paise * qty;
      lineItems.push({ slug: it.slug, qty, unit_price_paise: p.price_paise });
    }
    if (amount < 100) return res.status(400).json({ error: 'Order amount too small' });

    // Server-side coupon application (never trust client-computed discount)
    let couponCode = null;
    let discountPaise = 0;
    const rawCode = String((req.body || {}).couponCode || '').trim();
    if (rawCode) {
      const { rows: found } = await db.query('SELECT * FROM coupons WHERE code = $1', [rawCode]);
      const applied = applyCoupon(amount, found[0] || null);
      if (!found.length) {
        return res.status(400).json({ error: 'Invalid coupon code' });
      }
      if (applied.reason) {
        return res.status(400).json({ error: applied.reason });
      }
      couponCode = rawCode;
      discountPaise = applied.discountPaise;
      amount = applied.finalPaise;
      if (amount < 100) return res.status(400).json({ error: 'Order amount too small after coupon' });
    }

    const receipt = `rcpt_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';

    // COD path: skip Razorpay
    if (payMode === 'cod') {
      const { rows } = await db.query(
        `INSERT INTO orders (receipt, status, items, amount_paise, customer, coupon_code, discount_paise)
         VALUES ($1, 'cod_pending', $2, $3, $4, $5, $6) RETURNING id, receipt`,
        [receipt, JSON.stringify(lineItems), amount, JSON.stringify(customer), couponCode, discountPaise]
      );
      console.log(`[checkout] COD order ${rows[0].receipt} amount=${amount} coupon=${couponCode || '-'}`);
      return res.json({
        orderId: rows[0].id,
        receipt: rows[0].receipt,
        amount_paise: amount,
        couponCode,
        discount_paise: discountPaise,
        razorpayOrderId: null,
        keyId,
        payMode: 'cod',
      });
    }

    // Create pending order row first
    const { rows } = await db.query(
      `INSERT INTO orders (receipt, status, items, amount_paise, customer, coupon_code, discount_paise)
       VALUES ($1, 'pending', $2, $3, $4, $5, $6) RETURNING id, receipt`,
      [receipt, JSON.stringify(lineItems), amount, JSON.stringify(customer), couponCode, discountPaise]
    );
    const orderId = rows[0].id;

    // Razorpay order (or mock fallback)
    let razorpayOrderId;
    const client = razorpayClient();
    if (client) {
      try {
        const rzp = await client.orders.create({ amount, currency: 'INR', receipt });
        razorpayOrderId = rzp.id;
      } catch (e) {
        console.error('[checkout] razorpay error, falling back to mock:', e.message);
        razorpayOrderId = `order_mock_${Date.now()}`;
      }
    } else {
      razorpayOrderId = `order_mock_${Date.now()}`;
    }

    await db.query('UPDATE orders SET razorpay_order_id = $1 WHERE id = $2', [razorpayOrderId, orderId]);
    console.log(`[checkout] order ${receipt} amount=${amount} coupon=${couponCode || '-'} rzp=${razorpayOrderId}`);
    res.json({ orderId, receipt, amount_paise: amount, couponCode, discount_paise: discountPaise, razorpayOrderId, keyId });
  } catch (err) {
    console.error('[checkout] error:', err.message);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// GET /store/checkout/verify?receipt=
router.get('/verify', async (req, res) => {
  try {
    const { receipt } = req.query;
    if (!receipt) return res.status(400).json({ error: 'receipt required' });
    const { rows } = await db.query(
      'SELECT receipt, status, amount_paise, razorpay_payment_id FROM orders WHERE receipt = $1',
      [receipt]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[checkout] verify error:', err.message);
    res.status(500).json({ error: 'Verify failed' });
  }
});

module.exports = router;
