const express = require('express');
const db = require('../db');
const { escapeLike, clampInt } = require('../lib/text');

const router = express.Router();

// GET /store/products?q=&brand=&category=&maxPrice=&limit=&offset=
router.get('/', async (req, res) => {
  try {
    const { q, brand, category, maxPrice } = req.query;
    const limit = clampInt(req.query.limit, 50, 1, 100);
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

    params.push(limit);
    params.push(offset);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM products ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ products: rows, limit, offset });
  } catch (err) {
    console.error('[products] list error:', err.message);
    res.status(500).json({ error: 'Failed to list products' });
  }
});

// GET /store/products/stock?slugs=a,b,c — live availability for the cart.
// Must be declared before '/:slug' or Express would treat "stock" as a slug.
router.get('/stock', async (req, res) => {
  try {
    const slugs = String(req.query.slugs || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50);
    if (!slugs.length) return res.json({ stock: {} });
    const { rows } = await db.query(
      'SELECT slug, name, price_paise, stock FROM products WHERE slug = ANY($1)',
      [slugs]
    );
    const stock = {};
    for (const r of rows) stock[r.slug] = { name: r.name, pricePaise: r.price_paise, stock: r.stock };
    res.json({ stock });
  } catch (err) {
    console.error('[products] stock error:', err.message);
    res.status(500).json({ error: 'Failed to check stock' });
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
