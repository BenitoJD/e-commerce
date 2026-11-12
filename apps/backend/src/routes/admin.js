const express = require('express');
const db = require('../db');

const router = express.Router();

const ORDER_STATUSES = ['paid', 'shipped', 'delivered', 'cancelled', 'refunded', 'cod_pending'];
const QUOTE_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

// Token auth: header x-admin-token must equal process.env.ADMIN_TOKEN
router.use((req, res, next) => {
  if (!process.env.ADMIN_TOKEN) {
    return res.status(503).json({ error: 'admin disabled' });
  }
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// GET /admin/stats
router.get('/stats', async (req, res) => {
  try {
    const { rows: statusRows } = await db.query(
      'SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status'
    );
    const ordersByStatus = {};
    for (const r of statusRows) ordersByStatus[r.status] = r.count;

    const { rows: revRows } = await db.query(
      `SELECT COALESCE(SUM(amount_paise), 0)::int AS total FROM orders WHERE status = 'paid'`
    );
    const revenuePaise = revRows[0] ? revRows[0].total : 0;

    const { rows: lowStock } = await db.query(
      'SELECT slug, name, stock FROM products WHERE stock < 5 ORDER BY stock ASC'
    );

    const { rows: quoteRows } = await db.query(
      `SELECT COUNT(*)::int AS count FROM bulk_quotes WHERE status = 'new'`
    );
    const quotesNew = quoteRows[0] ? quoteRows[0].count : 0;

    res.json({ ordersByStatus, revenuePaise, lowStock, quotesNew });
  } catch (err) {
    console.error('[admin] stats error:', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /admin/orders?status=&limit=50
router.get('/orders', async (req, res) => {
  try {
    let limit = parseInt(req.query.limit, 10) || 50;
    limit = Math.min(Math.max(limit, 1), 200);
    const { status } = req.query;
    const conds = [];
    const params = [];
    if (status) {
      params.push(status);
      conds.push(`status = $${params.length}`);
    }
    params.push(limit);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT id, receipt, status, amount_paise, customer, razorpay_payment_id, created_at
       FROM orders ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params
    );
    res.json({ orders: rows });
  } catch (err) {
    console.error('[admin] orders error:', err.message);
    res.status(500).json({ error: 'Failed to list orders' });
  }
});

// PATCH /admin/orders/:id {status}
router.patch('/orders/:id', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` });
    }
    const { rows } = await db.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    console.log(`[admin] order ${rows[0].receipt} -> ${status}`);
    res.json({ order: rows[0] });
  } catch (err) {
    console.error('[admin] order update error:', err.message);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// GET /admin/quotes?status=
router.get('/quotes', async (req, res) => {
  try {
    const { status } = req.query;
    let rows;
    if (status) {
      const r = await db.query('SELECT * FROM bulk_quotes WHERE status = $1 ORDER BY created_at DESC LIMIT 200', [status]);
      rows = r.rows;
    } else {
      const r = await db.query('SELECT * FROM bulk_quotes ORDER BY created_at DESC LIMIT 200');
      rows = r.rows;
    }
    res.json({ quotes: rows });
  } catch (err) {
    console.error('[admin] quotes error:', err.message);
    res.status(500).json({ error: 'Failed to list quotes' });
  }
});

// PATCH /admin/quotes/:id {status}
router.patch('/quotes/:id', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!QUOTE_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${QUOTE_STATUSES.join(', ')}` });
    }
    const { rows } = await db.query(
      'UPDATE bulk_quotes SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Quote not found' });
    console.log(`[admin] quote #${req.params.id} -> ${status}`);
    res.json({ quote: rows[0] });
  } catch (err) {
    console.error('[admin] quote update error:', err.message);
    res.status(500).json({ error: 'Failed to update quote' });
  }
});

// PATCH /admin/products/:slug/stock {stock}
router.patch('/products/:slug/stock', async (req, res) => {
  try {
    const stock = parseInt(req.body && req.body.stock, 10);
    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ error: 'stock must be an integer >= 0' });
    }
    const { rows } = await db.query(
      'UPDATE products SET stock = $1 WHERE slug = $2 RETURNING slug, stock',
      [stock, req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    console.log(`[admin] stock ${rows[0].slug} -> ${rows[0].stock}`);
    res.json({ product: rows[0] });
  } catch (err) {
    console.error('[admin] stock update error:', err.message);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

module.exports = router;
