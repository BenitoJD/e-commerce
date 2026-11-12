const express = require('express');
const db = require('../db');
const { clampText } = require('../lib/validate');
const { applyCoupon } = require('../lib/pricing');

const router = express.Router();

// GET /store/engage/reviews/:slug -> { reviews, avg, count }
router.get('/reviews/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const { rows } = await db.query(
      'SELECT id, product_slug, name, rating, title, body, verified, created_at FROM reviews WHERE product_slug = $1 ORDER BY created_at DESC, id DESC',
      [slug]
    );
    const count = rows.length;
    const avg = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
    res.json({ reviews: rows, avg, count });
  } catch (err) {
    console.error('[engage] reviews list error:', err.message);
    res.status(500).json({ error: 'Failed to list reviews' });
  }
});

// POST /store/engage/reviews/:slug { name, rating 1-5, title, body }
router.post('/reviews/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const { name, rating, title, body } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name required' });
    }
    const r = parseInt(rating, 10);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: 'rating must be an integer 1-5' });
    }
    const { rows: p } = await db.query('SELECT 1 FROM products WHERE slug = $1', [slug]);
    if (!p.length) return res.status(404).json({ error: 'Product not found' });
    const { rows } = await db.query(
      `INSERT INTO reviews (product_slug, name, rating, title, body, verified)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING id, product_slug, name, rating, title, body, verified, created_at`,
      [slug, clampText(name, 80), r, clampText(title, 120), clampText(body, 2000)]
    );
    res.status(201).json({ review: rows[0] });
  } catch (err) {
    console.error('[engage] review create error:', err.message);
    res.status(500).json({ error: 'Failed to add review' });
  }
});

// GET /store/engage/questions/:slug -> { questions }
router.get('/questions/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const { rows } = await db.query(
      'SELECT id, product_slug, name, question, answer, created_at FROM questions WHERE product_slug = $1 ORDER BY created_at DESC, id DESC',
      [slug]
    );
    res.json({ questions: rows });
  } catch (err) {
    console.error('[engage] questions list error:', err.message);
    res.status(500).json({ error: 'Failed to list questions' });
  }
});

// POST /store/engage/questions/:slug { name, question }
router.post('/questions/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const { name, question } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name required' });
    }
    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: 'question required' });
    }
    const { rows: p } = await db.query('SELECT 1 FROM products WHERE slug = $1', [slug]);
    if (!p.length) return res.status(404).json({ error: 'Product not found' });
    const { rows } = await db.query(
      `INSERT INTO questions (product_slug, name, question, answer)
       VALUES ($1, $2, $3, '')
       RETURNING id, product_slug, name, question, answer, created_at`,
      [slug, String(name).trim(), String(question).trim()]
    );
    res.status(201).json({ question: rows[0] });
  } catch (err) {
    console.error('[engage] question create error:', err.message);
    res.status(500).json({ error: 'Failed to add question' });
  }
});

// POST /store/engage/answers/:id { answer, adminToken? } (open route, owner-only action)
router.post('/answers/:id', async (req, res) => {
  try {
    const { answer, adminToken } = req.body || {};
    // Accept the token via x-admin-token header (preferred) or legacy body field.
    const presented = req.headers['x-admin-token'] || adminToken;
    if (!process.env.ADMIN_TOKEN) {
      return res.status(503).json({ error: 'admin disabled' });
    }
    if (presented !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (answer === undefined || answer === null || !String(answer).trim()) {
      return res.status(400).json({ error: 'answer required' });
    }
    const { rows } = await db.query(
      `UPDATE questions SET answer = $1 WHERE id = $2
       RETURNING id, product_slug, name, question, answer, created_at`,
      [String(answer).trim(), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Question not found' });
    res.json({ question: rows[0] });
  } catch (err) {
    console.error('[engage] answer error:', err.message);
    res.status(500).json({ error: 'Failed to save answer' });
  }
});

// GET /store/engage/coupons/validate?code=&amount_paise=
// Delegates to the same tested pricing helper checkout uses, so the rules
// (expiry, usage caps, minimums, discount ceiling) can never drift apart.
router.get('/coupons/validate', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim();
    const amount = parseInt(req.query.amount_paise, 10) || 0;
    if (!code) return res.json({ valid: false, reason: 'code required' });
    const { rows } = await db.query('SELECT * FROM coupons WHERE UPPER(code) = UPPER($1)', [code]);
    if (!rows.length) return res.json({ valid: false, reason: 'Invalid coupon code' });
    const applied = applyCoupon(amount, rows[0]);
    if (applied.reason) return res.json({ valid: false, reason: applied.reason });
    res.json({
      valid: true,
      pct_off: rows[0].pct_off,
      discount_paise: applied.discountPaise,
      final_paise: applied.finalPaise,
    });
  } catch (err) {
    console.error('[engage] coupon validate error:', err.message);
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
});

module.exports = router;
