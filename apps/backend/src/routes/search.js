const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /store/search?q=&brand=&category=&maxPrice=&sort=&limit=
router.get('/', async (req, res) => {
  try {
    const { q, brand, category, maxPrice, sort } = req.query;
    let limit = parseInt(req.query.limit, 10) || 20;
    limit = Math.min(Math.max(limit, 1), 50);

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

    let orderBy = 'created_at DESC, id DESC';
    if (sort === 'low') orderBy = 'price_paise ASC, id DESC';
    else if (sort === 'high') orderBy = 'price_paise DESC, id DESC';
    else if (sort === 'new') orderBy = 'created_at DESC, id DESC';

    params.push(limit);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM products ${where} ORDER BY ${orderBy} LIMIT $${params.length}`,
      params
    );
    res.json({ products: rows });
  } catch (err) {
    console.error('[search] error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
