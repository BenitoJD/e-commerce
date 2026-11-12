const express = require('express');
const db = require('../db');

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
    const { rows } = await db.query(
      `INSERT INTO reviews (product_slug, name, rating, title, body, verified)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING id, product_slug, name, rating, title, body, verified, created_at`,
      [slug, String(name).trim(), r, String(title || ''), String(body || '')]
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

// POST /store/engage/answers/:id { answer, adminToken } (open route, body token check)
router.post('/answers/:id', async (req, res) => {
  try {
    const { answer, adminToken } = req.body || {};
    if (!process.env.ADMIN_TOKEN) {
      return res.status(503).json({ error: 'admin disabled' });
    }
    if (adminToken !== process.env.ADMIN_TOKEN) {
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
router.get('/coupons/validate', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim();
    const amount = parseInt(req.query.amount_paise, 10) || 0;
    if (!code) return res.json({ valid: false, reason: 'code required' });
    const { rows } = await db.query('SELECT * FROM coupons WHERE UPPER(code) = UPPER($1)', [code]);
    if (!rows.length) return res.json({ valid: false, reason: 'Invalid coupon code' });
    const c = rows[0];
    if (!c.active) return res.json({ valid: false, reason: 'Coupon is inactive' });
    if (amount < (c.min_order_paise || 0)) {
      return res.json({ valid: false, reason: `Minimum order is ${c.min_order_paise} paise` });
    }
    let discount = Math.floor((amount * c.pct_off) / 100);
    if (c.max_discount_paise > 0) discount = Math.min(discount, c.max_discount_paise);
    discount = Math.max(0, Math.min(discount, amount));
    res.json({ valid: true, pct_off: c.pct_off, discount_paise: discount });
  } catch (err) {
    console.error('[engage] coupon validate error:', err.message);
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
});

module.exports = router;
