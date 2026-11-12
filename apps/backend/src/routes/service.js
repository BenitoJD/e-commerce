const express = require('express');
const db = require('../db');
const { releaseItems } = require('../lib/stock');
const { refundPayment } = require('../lib/refunds');

const router = express.Router();

function zoneFor(firstDigit) {
  const d = parseInt(firstDigit, 10);
  if (d === 1 || d === 2) return { zone: 'North', etaDays: 4 };
  if (d === 3 || d === 4) return { zone: 'West', etaDays: 3 };
  if (d === 5 || d === 6) return { zone: 'South', etaDays: 3 };
  if (d >= 7 && d <= 9) return { zone: 'East/NE', etaDays: 5 };
  return { zone: 'North', etaDays: 4 };
}

// GET /store/service/pincode/:code
router.get('/pincode/:code', (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'pincode must be 6 digits' });
  }
  const { zone, etaDays } = zoneFor(code[0]);
  let codAvailable = true;
  if (req.query.amount_paise !== undefined) {
    const amount = parseInt(req.query.amount_paise, 10);
    if (!Number.isNaN(amount)) codAvailable = amount <= 2000000;
  }
  res.json({ serviceable: true, etaDays, codAvailable, zone });
});

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

function buildTimeline(order) {
  const at = order.created_at;
  const status = String(order.status || '');
  const placed = { status: 'placed', label: 'Order placed', at };
  if (status === 'cancelled') {
    return [placed, { status: 'cancelled', label: 'Cancelled', at }];
  }
  if (status === 'refunded') {
    return [placed, { status: 'refunded', label: 'Refunded', at }];
  }
  const timeline = [placed];
  if (status === 'pending' || status === 'cod_pending') return timeline;
  timeline.push({ status: 'paid', label: 'Payment confirmed', at });
  if (status === 'paid') return timeline;
  timeline.push({ status: 'shipped', label: 'Shipped', at });
  if (status === 'shipped') return timeline;
  timeline.push({ status: 'delivered', label: 'Delivered', at });
  return timeline;
}

// GET /store/service/track?receipt=&phone=
router.get('/track', async (req, res) => {
  try {
    const receipt = String(req.query.receipt || '').trim();
    const phone = digits(req.query.phone);
    if (!receipt) return res.status(400).json({ error: 'receipt required' });
    if (!phone) return res.status(400).json({ error: 'phone required' });
    const { rows } = await db.query(
      'SELECT receipt, status, amount_paise, items, customer, created_at FROM orders WHERE receipt = $1',
      [receipt]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    const order = rows[0];
    const customerPhone = digits(order.customer && order.customer.phone);
    const match =
      customerPhone === phone ||
      (customerPhone.length >= 10 &&
        phone.length >= 10 &&
        customerPhone.slice(-10) === phone.slice(-10));
    if (!match) return res.status(401).json({ error: 'Phone does not match order' });
    // Enrich line items with catalog names so tracking pages show names, not slugs.
    const lineItems = Array.isArray(order.items) ? order.items : [];
    const slugs = [...new Set(lineItems.map((it) => it && it.slug).filter(Boolean))];
    let bySlug = {};
    if (slugs.length) {
      try {
        const { rows: found } = await db.query(
          'SELECT slug, name, price_paise FROM products WHERE slug = ANY($1)',
          [slugs]
        );
        bySlug = Object.fromEntries(found.map((p) => [p.slug, p]));
      } catch { /* best-effort: fall back to raw line items */ }
    }
    const items = lineItems.map((it) => {
      const p = (it && bySlug[it.slug]) || {};
      const qty = parseInt(it && it.qty, 10) || 0;
      const unitPaise = it && it.unit_price_paise != null ? it.unit_price_paise : p.price_paise || 0;
      return {
        slug: it && it.slug,
        name: p.name || (it && it.slug),
        qty,
        unit_price_paise: unitPaise,
        price: Math.round(Number(unitPaise) / 100),
      };
    });
    res.json({
      receipt: order.receipt,
      status: order.status,
      amount_paise: order.amount_paise,
      items,
      timeline: buildTimeline(order),
    });
  } catch (err) {
    console.error('[service] track error:', err.message);
    res.status(500).json({ error: 'Track failed' });
  }
});

// POST /store/service/subscribe { email }
router.post('/subscribe', async (req, res) => {
  try {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'valid email required' });
    }
    await db.query('INSERT INTO subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING', [
      email,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[service] subscribe error:', err.message);
    res.status(500).json({ error: 'Subscribe failed' });
  }
});

// GET /store/service/orders?phone=
router.get('/orders', async (req, res) => {
  try {
    const phone = digits(req.query.phone);
    if (!phone || phone.length < 10) {
      return res.status(400).json({ error: 'valid phone (at least 10 digits) required' });
    }
    const last10 = phone.slice(-10);
    const { rows } = await db.query(
      `SELECT receipt, status, amount_paise, items, customer, created_at FROM orders
       WHERE RIGHT(regexp_replace(COALESCE(customer->>'phone', ''), '\\D', '', 'g'), 10) = $1
       ORDER BY created_at DESC LIMIT 20`,
      [last10]
    );
    res.json({
      orders: rows.map((o) => ({
        receipt: o.receipt,
        status: o.status,
        amount_paise: o.amount_paise,
        created_at: o.created_at,
        itemCount: Array.isArray(o.items)
          ? o.items.reduce((sum, it) => sum + (parseInt(it && it.qty, 10) || 0), 0)
          : 0,
      })),
    });
  } catch (err) {
    console.error('[service] orders error:', err.message);
    res.status(500).json({ error: 'Orders lookup failed' });
  }
});

// POST /store/service/cancel { receipt, phone }
router.post('/cancel', async (req, res) => {
  try {
    const receipt = String((req.body && req.body.receipt) || '').trim();
    const phone = digits(req.body && req.body.phone);
    if (!receipt) return res.status(400).json({ error: 'receipt required' });
    if (!phone || phone.length < 10) {
      return res.status(400).json({ error: 'valid phone (at least 10 digits) required' });
    }
    const { rows } = await db.query(
      'SELECT receipt, status, items, amount_paise, razorpay_payment_id, customer FROM orders WHERE receipt = $1',
      [receipt]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    const order = rows[0];
    const customerPhone = digits(order.customer && order.customer.phone);
    const match =
      customerPhone === phone ||
      (customerPhone.length >= 10 &&
        phone.length >= 10 &&
        customerPhone.slice(-10) === phone.slice(-10));
    if (!match) return res.status(404).json({ error: 'Phone does not match order' });
    const cancellable = ['pending', 'paid', 'cod_pending'];
    if (!cancellable.includes(String(order.status))) {
      return res
        .status(409)
        .json({ error: `Cannot cancel order with status '${order.status}'` });
    }
    const { rows: updated } = await db.query(
      "UPDATE orders SET status = 'cancelled' WHERE receipt = $1 RETURNING receipt, status",
      [receipt]
    );
    // Reservation was taken at checkout for pending/paid/cod_pending — put it back.
    await releaseItems(db, Array.isArray(order.items) ? order.items : []);
    // Paid online orders get an automatic gateway refund when possible; otherwise manual.
    let refund = { mode: 'none' };
    if (order.status === 'paid') {
      refund = await refundPayment(order);
    }
    res.json({ ok: true, receipt: updated[0].receipt, status: updated[0].status, refund: refund.mode });
  } catch (err) {
    console.error('[service] cancel error:', err.message);
    res.status(500).json({ error: 'Cancel failed' });
  }
});

// POST /store/contact { name, phone?, message } — persisted for admin triage
router.post('/contact', async (req, res) => {
  try {
    const name = String((req.body && req.body.name) || '').trim();
    const phone = digits(req.body && req.body.phone);
    const message = String((req.body && req.body.message) || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!message) return res.status(400).json({ error: 'message required' });
    if (phone && phone.length < 10) {
      return res.status(400).json({ error: 'valid phone required (at least 10 digits)' });
    }
    const { rows } = await db.query(
      `INSERT INTO contact_messages (name, phone, message) VALUES ($1, $2, $3) RETURNING id, created_at`,
      [name, phone, message]
    );
    console.log(`[service] contact message #${rows[0].id} from ${name}`);
    res.status(201).json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error('[service] contact error:', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// POST /store/service/returns { receipt, phone, reason, details } — file a return/exchange
const RETURN_REASONS = ['damaged', 'wrong-item', 'defective', 'not-needed', 'other'];
const RETURNABLE = ['delivered', 'paid', 'shipped'];

router.post('/returns', async (req, res) => {
  try {
    const receipt = String((req.body && req.body.receipt) || '').trim();
    const phone = digits(req.body && req.body.phone);
    const reason = String((req.body && req.body.reason) || '').trim().toLowerCase();
    const details = String((req.body && req.body.details) || '').trim().slice(0, 1000);
    if (!receipt) return res.status(400).json({ error: 'receipt required' });
    if (!phone || phone.length < 10) {
      return res.status(400).json({ error: 'valid phone (at least 10 digits) required' });
    }
    if (!RETURN_REASONS.includes(reason)) {
      return res.status(400).json({ error: `reason must be one of: ${RETURN_REASONS.join(', ')}` });
    }
    const { rows } = await db.query(
      'SELECT receipt, status, customer FROM orders WHERE receipt = $1',
      [receipt]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    const order = rows[0];
    const customerPhone = digits(order.customer && order.customer.phone);
    const match = customerPhone === phone
      || (customerPhone.length >= 10 && phone.length >= 10 && customerPhone.slice(-10) === phone.slice(-10));
    if (!match) return res.status(404).json({ error: 'Phone does not match order' });
    if (!RETURNABLE.includes(String(order.status))) {
      return res.status(409).json({ error: `Orders with status '${order.status}' are not returnable` });
    }
    const ins = await db.query(
      `INSERT INTO return_requests (receipt, phone, reason, details)
       VALUES ($1, $2, $3, $4) RETURNING id, status, created_at`,
      [receipt, phone, reason, details]
    );
    console.log(`[service] return #${ins.rows[0].id} for ${receipt} (${reason})`);
    res.status(201).json({ ok: true, id: ins.rows[0].id, status: ins.rows[0].status, receipt });
  } catch (err) {
    console.error('[service] return error:', err.message);
    res.status(500).json({ error: 'Failed to file return' });
  }
});

module.exports = router;
