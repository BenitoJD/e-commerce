const express = require('express');
const db = require('../db');

const router = express.Router();

// POST /store/quotes
router.post('/', async (req, res) => {
  try {
    const { name, phone, product_slug, qty, message } = req.body || {};
    if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
    const { rows } = await db.query(
      `INSERT INTO bulk_quotes (name, phone, product_slug, qty, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, phone, product_slug || '', parseInt(qty, 10) || 1, message || '']
    );
    console.log(`[quotes] new quote #${rows[0].id} from ${name}`);
    res.status(201).json({ quote: rows[0] });
  } catch (err) {
    console.error('[quotes] create error:', err.message);
    res.status(500).json({ error: 'Failed to create quote' });
  }
});

// GET /store/quotes (admin list)
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM bulk_quotes ORDER BY created_at DESC LIMIT 200');
    res.json({ quotes: rows });
  } catch (err) {
    console.error('[quotes] list error:', err.message);
    res.status(500).json({ error: 'Failed to list quotes' });
  }
});

module.exports = router;
