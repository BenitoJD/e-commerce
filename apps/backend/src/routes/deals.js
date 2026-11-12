const express = require('express');
const db = require('../db');
const { clampInt } = require('../lib/text');

const router = express.Router();

// GET /store/deals?minOff=20&limit=60 — discounted products, computed in SQL.
// The storefront previously filtered the first 100 products, so a deal beyond that page
// never appeared. Ordering/limiting belongs in the database.
router.get('/', async (req, res) => {
  try {
    const minOff = clampInt(req.query.minOff, 20, 1, 90);
    const limit = clampInt(req.query.limit, 60, 1, 200);
    const { rows } = await db.query(
      `SELECT *, ROUND(((mrp_paise - price_paise)::numeric / NULLIF(mrp_paise, 0)) * 100)::int AS discount_pct
         FROM products
        WHERE mrp_paise > price_paise
          AND ((mrp_paise - price_paise)::numeric / NULLIF(mrp_paise, 0)) * 100 >= $1
        ORDER BY discount_pct DESC, price_paise ASC
        LIMIT $2`,
      [minOff, limit]
    );
    res.json({ deals: rows });
  } catch (err) {
    console.error('[deals] list error:', err.message);
    res.status(500).json({ error: 'Failed to list deals' });
  }
});

module.exports = router;
