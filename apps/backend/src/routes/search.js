const express = require('express');
const db = require('../db');
const { escapeLike, clampInt, sortClause } = require('../lib/text');

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

    const orderBy = sortClause(sort);

    params.push(limit);
    params.push(offset);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM products ${where} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    // Total matches so callers can show "N products" and know when to page.
    let total = null;
    try {
      const { rows: countRows } = await db.query(
        `SELECT COUNT(*)::int AS total FROM products ${where}`,
        params.slice(0, -2)
      );
      total = countRows[0] ? countRows[0].total : null;
    } catch (e) {
      console.error('[search] count error:', e.message);
    }
    res.json({ products: rows, limit, offset, total });
  } catch (err) {
    console.error('[search] error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /store/search/suggest?q= — lightweight typeahead (products + brands + categories)
// Kept deliberately small so the header can call it on every keystroke.
router.get('/suggest', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ products: [], brands: [], categories: [] });
    }
    const like = `%${escapeLike(q)}%`;
    const prefix = `${escapeLike(q)}%`;

    const { rows: products } = await db.query(
      `SELECT slug, name, brand, price_paise, mrp_paise, stock, images
         FROM products
        WHERE name ILIKE $1 ESCAPE '\\' OR brand ILIKE $1 ESCAPE '\\' OR category ILIKE $1 ESCAPE '\\'
        ORDER BY (name ILIKE $2 ESCAPE '\\') DESC, stock > 0 DESC, name ASC
        LIMIT 6`,
      [like, prefix]
    );
    const { rows: brands } = await db.query(
      `SELECT brand, COUNT(*)::int AS count FROM products
        WHERE brand ILIKE $1 ESCAPE '\\' GROUP BY brand ORDER BY count DESC LIMIT 4`,
      [like]
    );
    const { rows: categories } = await db.query(
      `SELECT category, COUNT(*)::int AS count FROM products
        WHERE category ILIKE $1 ESCAPE '\\' GROUP BY category ORDER BY count DESC LIMIT 3`,
      [like]
    );
    res.json({ products, brands, categories, q });
  } catch (err) {
    console.error('[search] suggest error:', err.message);
    res.status(500).json({ error: 'Suggestions unavailable' });
  }
});

module.exports = router;
