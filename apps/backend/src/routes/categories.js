const express = require('express');
const db = require('../db');
const { CATEGORIES } = require('../../data/categories');
const { buildCategoryTree } = require('../lib/categoryTree');

const router = express.Router();

// GET /store/categories — the two-level tree with product counts per node.
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT category, COALESCE(subcategory, '') AS subcategory, COUNT(*)::int AS count
         FROM products
        GROUP BY category, COALESCE(subcategory, '')`
    );
    const { tree, unknown } = buildCategoryTree(rows, CATEGORIES);
    if (unknown.length) {
      console.error('[categories] catalogue rows outside the taxonomy:', unknown.join(', '));
    }
    res.json({ categories: tree });
  } catch (err) {
    console.error('[categories] list error:', err.message);
    res.status(500).json({ error: 'Failed to list categories' });
  }
});

module.exports = router;
