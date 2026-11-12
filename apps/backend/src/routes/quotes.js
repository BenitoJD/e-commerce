const express = require('express');
const db = require('../db');

const router = express.Router();

// POST /store/quotes
router.post('/', async (req, res) => {
  try {
    const { name, phone, qty, message } = req.body || {};
    if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
    // Accept a catalog slug (product_slug) or free text (product): resolve slugs/names to catalog.
    const rawSlug = String((req.body && req.body.product_slug) || '').trim();
    const rawText = String((req.body && (req.body.product ?? req.body.product_name)) || '').trim();
    let slug = rawSlug;
    let productName = '';
    if (!slug && rawText) {
      const { rows: found } = await db.query(
        'SELECT slug FROM products WHERE slug = $1 OR LOWER(name) = LOWER($1) LIMIT 1',
        [rawText]
      );
      if (found.length) slug = found[0].slug;
      else productName = rawText.slice(0, 200);
    }
    const { rows } = await db.query(
      `INSERT INTO bulk_quotes (name, phone, product_slug, product_name, qty, message)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, phone, slug, productName, parseInt(qty, 10) || 1, message || '']
    );
    console.log(`[quotes] new quote #${rows[0].id} from ${name} slug=${slug || '(custom)'}`);
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
