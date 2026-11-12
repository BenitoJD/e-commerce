const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /store/brands — every brand with its product count.
// The storefront used to derive this from the first 100 products, which silently hid
// brands beyond that page. Aggregating in SQL stays correct as the catalogue grows.
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT brand, COUNT(*)::int AS count
         FROM products
        WHERE brand IS NOT NULL AND brand <> ''
        GROUP BY brand
        ORDER BY brand ASC`
    );
    res.json({ brands: rows.map((r) => ({ name: r.brand, count: r.count })) });
  } catch (err) {
    console.error('[brands] list error:', err.message);
    res.status(500).json({ error: 'Failed to list brands' });
  }
});

module.exports = router;
