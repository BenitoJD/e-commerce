const express = require('express');
const db = require('../db');
const { clampText, clampInt, normalizePhone } = require('../lib/validate');

const router = express.Router();

// POST /store/quotes
router.post('/', async (req, res) => {
  try {
    const { name, phone, qty, message } = req.body || {};
    if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
    const cleanName = clampText(name, 120);
    const cleanPhone = normalizePhone(phone);
    if (!cleanName) return res.status(400).json({ error: 'name required' });
    if (!cleanPhone) return res.status(400).json({ error: 'valid 10-digit phone required' });
    const cleanQty = clampInt(qty, { min: 1, max: 100000, fallback: 1 });
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
      [cleanName, cleanPhone, slug, productName, cleanQty, clampText(message, 2000)]
    );
    console.log(`[quotes] new quote #${rows[0].id} from ${name} slug=${slug || '(custom)'}`);
    res.status(201).json({ quote: rows[0] });
  } catch (err) {
    console.error('[quotes] create error:', err.message);
    res.status(500).json({ error: 'Failed to create quote' });
  }
});

// GET /store/quotes?phone= — a buyer's own quote requests (B2B status lookup).
// This route used to return every quote in the database, which leaked other
// customers' names and phone numbers. It is now scoped to the caller's phone.
router.get('/', async (req, res) => {
  try {
    const phone = String(req.query.phone || '').replace(/\D/g, '');
    if (phone.length < 10) {
      return res.status(400).json({ error: 'phone required (at least 10 digits)' });
    }
    const last10 = phone.slice(-10);
    const { rows } = await db.query(
      `SELECT id, name, product_slug, product_name, qty, message, status, order_receipt, created_at
         FROM bulk_quotes
        WHERE RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 20`,
      [last10]
    );
    res.json({ quotes: rows });
  } catch (err) {
    console.error('[quotes] list error:', err.message);
    res.status(500).json({ error: 'Failed to list quotes' });
  }
});

module.exports = router;
