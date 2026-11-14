const express = require('express');
const db = require('../db');
const { applyCoupon } = require('../lib/pricing');
const { withTransaction, reserveItems, releaseItems } = require('../lib/stock');
const { releaseCouponUse } = require('../lib/couponRelease');
const { onlinePaymentMode, mockPaymentsAllowed, isMockId, paymentsConfigured } = require('../lib/payments');
const { makeReceipt } = require('../lib/receipt');
const { clampText, normalizePhone, normalizeGstin, isValidGstin } = require('../lib/validate');
const { resolveState } = require('../../data/states');
const { normalizeEmail, isEmail, notifyOrder } = require('../lib/notify');
const { userFromRequest } = require('../lib/auth');
const { codMaxPaise, shippingFeePaise } = require('../lib/policy');

const router = express.Router();

function razorpayClient() {
  if (!paymentsConfigured()) return null; // local dev / placeholder keys: use mock
  return new (require('razorpay'))({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// Upper bound per line: keeps amount_paise (PostgreSQL INTEGER) far from overflow and
// sends genuine bulk buyers to the quote flow instead.
const MAX_QTY_PER_ITEM = 999;

// POST /store/checkout/create
router.post('/create', async (req, res) => {
  try {
    const { items, customer } = req.body || {};
    // The storefront sends "COD"/"UPI"/"Card"/"EMI" (display labels). Normalise before
    // comparing: a strict `payMode === 'cod'` check silently turned every COD order into an
    // unpaid online order, holding stock and never collecting cash.
    const payModeRaw = String((req.body || {}).payMode || '').trim().toLowerCase();
    const allowedPayModes = new Set(['', 'cod', 'cash', 'online', 'upi', 'card', 'emi', 'netbanking']);
    if (!allowedPayModes.has(payModeRaw)) {
      return res.status(400).json({ error: 'Unknown payment mode', code: 'BAD_PAY_MODE' });
    }
    const isCod = payModeRaw === 'cod' || payModeRaw === 'cash';
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items[] with {slug, qty} required' });
    }
    if (items.length > 50) {
      return res.status(400).json({ error: 'Too many distinct items in one order (max 50)' });
    }
    // Normalise the basket before pricing it: merge repeated slugs into one line (so the
    // invoice/picking list can't show the same SKU twice) and bound the quantity, which
    // otherwise overflows the INTEGER amount column for a large enough value.
    const basket = new Map();
    for (const it of items) {
      const slug = String((it && it.slug) || '').trim();
      if (!slug) return res.status(400).json({ error: 'Every item needs a slug' });
      const qty = parseInt(it.qty, 10) || 0;
      if (qty < 1) return res.status(400).json({ error: `Invalid qty for ${slug}` });
      if (qty > MAX_QTY_PER_ITEM) {
        return res.status(400).json({ error: `Maximum ${MAX_QTY_PER_ITEM} units per item, contact us for bulk pricing` });
      }
      basket.set(slug, (basket.get(slug) || 0) + qty);
      if (basket.get(slug) > MAX_QTY_PER_ITEM) {
        return res.status(400).json({ error: `Maximum ${MAX_QTY_PER_ITEM} units per item, contact us for bulk pricing` });
      }
    }
    const normalisedItems = [...basket.entries()].map(([slug, qty]) => ({ slug, qty }));
    if (!customer || !customer.name || !customer.phone) {
      return res.status(400).json({ error: 'customer {name, phone} required' });
    }
    // Normalise and bound the customer block. A malformed phone would make the order
    // untrackable later (tracking/My Orders both match on digits), and addresses have no
    // business being megabytes.
    const cleanName = clampText(customer.name, 120);
    const cleanPhone = normalizePhone(customer.phone);
    if (!cleanName) return res.status(400).json({ error: 'customer name required' });
    if (!cleanPhone) {
      return res.status(400).json({ error: 'customer phone must be a valid 10-digit number' });
    }
    const rawPincode = String(customer.pincode == null ? '' : customer.pincode).replace(/\D/g, '');
    if (rawPincode && rawPincode.length !== 6) {
      return res.status(400).json({ error: 'pincode must be 6 digits' });
    }
    // Business buyers need their GSTIN on the tax invoice; validate when supplied.
    // The check character matters: a typo prints a legally useless invoice.
    const buyerGstin = normalizeGstin(customer.gstin);
    if (buyerGstin && !isValidGstin(buyerGstin)) {
      return res.status(400).json({ error: 'GSTIN looks invalid, check the 15-character number on your registration certificate' });
    }
    // State matters for GST: the invoice's place of supply (and CGST/SGST vs IGST) is
    // decided by it. Optional so older clients keep working, validated when supplied.
    const state = resolveState(customer.stateCode || customer.state || '');
    if ((customer.stateCode || customer.state) && !state) {
      return res.status(400).json({ error: 'Unknown state, pick your delivery state from the list' });
    }
    // Email is nullable for backwards compatibility, but a real store needs it for the
    // order confirmation and shipping updates. A signed-in account supplies it implicitly.
    const account = await userFromRequest(db, req).catch(() => null);
    const rawEmail = String(customer.email || (account && account.email) || '').trim();
    const buyerEmail = rawEmail ? normalizeEmail(rawEmail) : '';
    if (buyerEmail && !isEmail(buyerEmail)) {
      return res.status(400).json({ error: 'Enter a valid email address for order updates' });
    }
    const buyer = {
      name: cleanName,
      phone: cleanPhone,
      email: buyerEmail || null,
      address: clampText(customer.address, 500),
      pincode: rawPincode,
      gstin: buyerGstin || null,
      stateCode: state ? state.code : null,
      state: state ? state.name : null,
    };

    // Lookup products (from the normalised basket, not the raw request)
    const slugs = normalisedItems.map((i) => i.slug);
    const { rows: found } = await db.query(
      `SELECT slug, price_paise, stock FROM products WHERE slug = ANY($1)`,
      [slugs]
    );
    const bySlug = Object.fromEntries(found.map((p) => [p.slug, p]));

    let amount = 0;
    const lineItems = [];
    for (const it of normalisedItems) {
      const p = bySlug[it.slug];
      if (!p) return res.status(400).json({ error: `Unknown product slug: ${it.slug}` });
      amount += p.price_paise * it.qty;
      lineItems.push({ slug: it.slug, qty: it.qty, unit_price_paise: p.price_paise });
    }
    if (amount < 100) return res.status(400).json({ error: 'Order amount too small' });

    // Server-side coupon application (never trust client-computed discount)
    let couponCode = null;
    let discountPaise = 0;
    const rawCode = String((req.body || {}).couponCode || '').trim();
    if (rawCode) {
      const { rows: found } = await db.query('SELECT * FROM coupons WHERE UPPER(code) = UPPER($1)', [rawCode]);
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

    // Shipping is added after the discount, and the order total (what Razorpay charges)
    // includes it. Default policy is free shipping; the operator opts in via env.
    const itemsPaise = amount;
    const shippingPaise = shippingFeePaise(itemsPaise);
    amount += shippingPaise;

    // COD policy: capped at COD_MAX_PAISE (default ₹20,000). High-value machinery has to
    // be prepaid, otherwise refused deliveries cost us freight both ways.
    const codMax = codMaxPaise();
    if (isCod && amount > codMax) {
      return res.status(400).json({
        error: `Cash on Delivery is available up to ₹${(codMax / 100).toLocaleString('en-IN')}. Please pay online for this order.`,
        code: 'COD_LIMIT',
        codMaxPaise: codMax,
      });
    }

    // Decide payment handling BEFORE reserving stock: a production deploy without Razorpay
    // keys must refuse the order with a clear message, not create a mock one that holds stock.
    let paymentMode = 'cod';
    if (!isCod) {
      paymentMode = onlinePaymentMode(process.env);
      if (paymentMode === 'error') {
        return res.status(503).json({
          error: 'Online payment is not available yet. Please choose Cash on Delivery or contact us on WhatsApp.',
          code: 'PAYMENTS_NOT_CONFIGURED',
        });
      }
    }

    const receipt = makeReceipt();
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';
    const orderStatus = isCod ? 'cod_pending' : 'pending';

    // Reserve stock + create order atomically (prevents overselling on concurrent checkouts)
    let created;
    try {
      created = await withTransaction(async (tx) => {
        await reserveItems(tx, lineItems);
        // Claim a coupon use atomically so a usage-limited code can't be redeemed
        // twice by two simultaneous checkouts. Returns 0 rows when the cap is hit.
        if (couponCode) {
          const claim = await tx.query(
            `UPDATE coupons
                SET used_count = used_count + 1
              WHERE UPPER(code) = UPPER($1)
                AND (max_uses IS NULL OR max_uses <= 0 OR used_count < max_uses)
              RETURNING code`,
            [couponCode]
          );
          if (!claim.rows.length) {
            const err = new Error('Coupon usage limit reached');
            err.code = 'COUPON_EXHAUSTED';
            throw err;
          }
        }
        const { rows } = await tx.query(
          `INSERT INTO orders (receipt, status, items, amount_paise, customer, coupon_code, discount_paise, pay_mode, shipping_paise, customer_email, user_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, receipt`,
          [receipt, orderStatus, JSON.stringify(lineItems), amount, JSON.stringify(buyer), couponCode, discountPaise, isCod ? 'cod' : 'online', shippingPaise, buyerEmail || null, account ? account.id : null, clampText((req.body || {}).notes, 500) || null]
        );
        return rows[0];
      });
    } catch (err) {
      if (err.code === 'INSUFFICIENT_STOCK') {
        return res.status(409).json({ error: `Insufficient stock for ${err.slug}` });
      }
      if (err.code === 'COUPON_EXHAUSTED') {
        return res.status(400).json({ error: 'Coupon usage limit reached' });
      }
      throw err;
    }
    const orderId = created.id;

    // Confirmation goes into the outbox (delivery is retried independently). No email on
    // file means nothing is queued, the response still succeeds.
    try {
      if (buyerEmail) {
        await notifyOrder(db, { receipt: created.receipt, items: lineItems, amount_paise: amount, customer: buyer, customer_email: buyerEmail, pay_mode: isCod ? 'cod' : 'online' }, 'placed');
      }
    } catch (notifyErr) {
      console.error('[checkout] confirmation email failed to queue:', notifyErr.message);
    }

    if (isCod) {
      console.log(`[checkout] COD order ${created.receipt} amount=${amount} coupon=${couponCode || '-'}`);
      return res.json({
        orderId,
        receipt: created.receipt,
        amount_paise: amount,
        couponCode,
        discount_paise: discountPaise,
        shipping_paise: shippingPaise,
        razorpayOrderId: null,
        keyId,
        payMode: 'cod',
      });
    }

    // Razorpay order, or, in development, a mock one.
    let razorpayOrderId;
    const client = razorpayClient();
    if (client) {
      try {
        const rzp = await client.orders.create({ amount, currency: 'INR', receipt });
        razorpayOrderId = rzp.id;
      } catch (e) {
        console.error('[checkout] razorpay error:', e.message);
        if (paymentMode !== 'mock') {
          // Production: don't pretend the payment started. Release the reservation, mark the
          // order failed and free the coupon so the shopper can retry cleanly.
          await withTransaction(async (tx) => {
            await releaseItems(tx, lineItems);
            await tx.query("UPDATE orders SET status = 'failed' WHERE id = $1", [orderId]);
            if (couponCode) await releaseCouponUse(tx, couponCode);
          }).catch((releaseErr) => console.error('[checkout] cleanup after payment failure:', releaseErr.message));
          return res.status(502).json({
            error: 'Could not start the payment. Please retry, or choose Cash on Delivery.',
            code: 'PAYMENT_START_FAILED',
          });
        }
        razorpayOrderId = `order_mock_${Date.now()}`;
      }
    } else {
      razorpayOrderId = `order_mock_${Date.now()}`;
    }

    await db.query('UPDATE orders SET razorpay_order_id = $1 WHERE id = $2', [razorpayOrderId, orderId]);
    const mock = isMockId(razorpayOrderId);
    console.log(`[checkout] order ${receipt} amount=${amount} coupon=${couponCode || '-'} rzp=${razorpayOrderId}`);
    res.json({ orderId, receipt, amount_paise: amount, couponCode, discount_paise: discountPaise, shipping_paise: shippingPaise, razorpayOrderId, keyId, mock });
  } catch (err) {
    console.error('[checkout] error:', err.message);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// POST /store/checkout/mock-pay  { receipt }
// Development-only completion for the mock Razorpay order id. Without this, a local
// install has no way to finish an online checkout: the UI opens a payment sheet with a
// placeholder key, the order stays pending and holds stock forever. Refuses in production
// unless the operator explicitly opted into mock payments, and only ever touches mock ids.
router.post('/mock-pay', async (req, res) => {
  try {
    if (!mockPaymentsAllowed(process.env)) {
      return res.status(403).json({ error: 'Mock payments are disabled' });
    }
    const receipt = String((req.body || {}).receipt || '').trim();
    if (!receipt) return res.status(400).json({ error: 'receipt required' });
    const { rows } = await db.query(
      'SELECT id, status, razorpay_order_id FROM orders WHERE receipt = $1',
      [receipt]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    const order = rows[0];
    if (!isMockId(order.razorpay_order_id)) {
      return res.status(400).json({ error: 'This order is not a mock payment order' });
    }
    if (order.status === 'paid') {
      return res.json({ ok: true, receipt, status: 'paid', already: true });
    }
    if (order.status !== 'pending') {
      return res.status(409).json({ error: `Cannot pay an order in status '${order.status}'` });
    }
    await db.query(
      "UPDATE orders SET status = 'paid', razorpay_payment_id = $1 WHERE id = $2",
      [`pay_mock_${Date.now()}`, order.id]
    );
    console.log(`[checkout] mock payment captured for ${receipt}`);
    res.json({ ok: true, receipt, status: 'paid' });
  } catch (err) {
    console.error('[checkout] mock-pay error:', err.message);
    res.status(500).json({ error: 'Mock payment failed' });
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
