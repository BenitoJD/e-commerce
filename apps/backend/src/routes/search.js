const express = require('express');
const db = require('../db');
const { escapeLike, clampInt } = require('../lib/text');

const router = express.Router();

// GET /store/search?q=&brand=&category=&maxPrice=&sort=&limit=&offset=
router.get('/', async (req, res) => {
  try {
    const { q, brand, category, maxPrice, sort } = req.query;
    const limit = clampInt(req.query.limit, 20, 1, 50);
    const offset = clampInt(req.query.offset, 0, 0, 10000);

    const conds = [];
    const params = [];

    if (q) {
      params.push(`%${escapeLike(q)}%`);
      conds.push(`(name ILIKE $${params.length} ESCAPE '\\' OR brand ILIKE $${params.length} ESCAPE '\\' OR category ILIKE $${params.length} ESCAPE '\\')`);
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
    params.push(offset);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM products ${where} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ products: rows, limit, offset });
  } catch (err) {
    console.error('[search] error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
