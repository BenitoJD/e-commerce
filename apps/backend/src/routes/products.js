const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /store/products?q=&brand=&category=&maxPrice=&limit=
router.get('/', async (req, res) => {
  try {
    const { q, brand, category, maxPrice } = req.query;
    let limit = parseInt(req.query.limit, 10) || 50;
    limit = Math.min(Math.max(limit, 1), 100);

    const conds = [];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      conds.push(`(name ILIKE $${params.length} OR brand ILIKE $${params.length} OR category ILIKE $${params.length})`);
    }
    if (brand) {
      params.push(brand);
      conds.push(`brand ILIKE $${params.length}`);
    }
    if (category) {
      params.push(category);
      conds.push(`category ILIKE $${params.length}`);
    }
    if (maxPrice) {
      // maxPrice in rupees -> convert to paise
      const paise = Math.round(parseFloat(maxPrice) * 100);
      if (!Number.isNaN(paise)) {
        params.push(paise);
        conds.push(`price_paise <= $${params.length}`);
      }
    }

    params.push(limit);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM products ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params
    );
    res.json({ products: rows });
  } catch (err) {
    console.error('[products] list error:', err.message);
    res.status(500).json({ error: 'Failed to list products' });
  }
});

// GET /store/products/:slug
router.get('/:slug', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM products WHERE slug = $1', [req.params.slug]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: rows[0] });
  } catch (err) {
    console.error('[products] detail error:', err.message);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

module.exports = router;
