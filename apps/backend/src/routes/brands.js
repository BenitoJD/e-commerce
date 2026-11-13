const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /store/brands — every brand with its product count.
// The storefront used to derive this from the first 100 products, which silently hid
// brands beyond that page. Aggregating in SQL stays correct as the catalogue grows.
router.get('/', async (req, res) => {
  try {
    // Pick one representative product image per brand for the directory cards. The inner
    // aggregate keeps the count correct; the join only decorates it.
    const { rows } = await db.query(
      `SELECT b.brand, b.count, p.slug AS sample_slug, p.images[1] AS image
         FROM (
           SELECT brand, COUNT(*)::int AS count, MAX(id) AS sample_id
             FROM products
            WHERE brand IS NOT NULL AND brand <> ''
            GROUP BY brand
         ) b
         JOIN products p ON p.id = b.sample_id
        ORDER BY b.brand ASC`
    );
    res.json({ brands: rows.map((r) => ({ name: r.brand, count: r.count, sampleSlug: r.sample_slug || null, image: r.image || null })) });
  } catch (err) {
    console.error('[brands] list error:', err.message);
    res.status(500).json({ error: 'Failed to list brands' });
  }
});

module.exports = router;
