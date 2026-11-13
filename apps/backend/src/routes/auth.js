const express = require('express');
const db = require('../db');
const { clampText, normalizePhone } = require('../lib/validate');
const { resolveState } = require('../../data/states');
const {
  hashPassword, verifyPassword, createSession, bearerToken, sessionUser,
  generateOtp, hashOtp, otpMatches, issueOrderToken, randomToken, hashToken,
  OTP_MINUTES, OTP_MAX_ATTEMPTS,
} = require('../lib/auth');
const { normalizeEmail, isEmail, notifyPasswordReset } = require('../lib/notify');

const router = express.Router();

const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, createdAt: row.created_at };
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;
}

async function addressesFor(userId) {
  const { rows } = await db.query(
    'SELECT id, label, name, phone, address, pincode, state_code, state, is_default FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, id ASC',
    [userId]
  );
  return rows;
}

// POST /store/auth/register
router.post('/register', async (req, res) => {
  try {
    const { password } = req.body || {};
    const name = clampText((req.body || {}).name, 120);
    const email = normalizeEmail((req.body || {}).email);
    const phone = normalizePhone((req.body || {}).phone);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!isEmail(email) || email.length > EMAIL_MAX) return res.status(400).json({ error: 'Enter a valid email address' });
    if (!validPassword(password)) return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN} characters` });
    if ((req.body || {}).phone && !phone) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });

    const exists = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'An account with this email already exists' });

    const { rows } = await db.query(
      `INSERT INTO users (name, email, phone, password_hash) VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, phone, created_at`,
      [name, email, phone || '', hashPassword(password)]
    );
    const session = await createSession(db, rows[0].id);
    res.status(201).json({ token: session.token, user: publicUser(rows[0]), addresses: [] });
  } catch (err) {
    console.error('[auth] register error:', err.message);
    res.status(500).json({ error: 'Could not create the account' });
  }
});

// POST /store/auth/login
router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail((req.body || {}).email);
    const password = String((req.body || {}).password || '');
    if (!isEmail(email) || !password) return res.status(400).json({ error: 'Email and password are required' });
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    // Same generic message for unknown email and wrong password (no account enumeration).
    if (!rows.length || !verifyPassword(password, rows[0].password_hash)) {
      return res.status(401).json({ error: 'Email or password is incorrect' });
    }
    const session = await createSession(db, rows[0].id);
    res.json({ token: session.token, user: publicUser(rows[0]), addresses: await addressesFor(rows[0].id) });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(500).json({ error: 'Could not sign in' });
  }
});

// POST /store/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const token = bearerToken(req);
    if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] logout error:', err.message);
    res.json({ ok: true });
  }
});

// GET /store/auth/me
router.get('/me', async (req, res) => {
  try {
    const user = await sessionUser(db, bearerToken(req));
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    res.json({ user: publicUser(user), addresses: await addressesFor(user.id) });
  } catch (err) {
    console.error('[auth] me error:', err.message);
    res.status(500).json({ error: 'Could not load the account' });
  }
});

// POST /store/auth/forgot-password { email }
router.post('/forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail((req.body || {}).email);
    // Always answer the same way so the endpoint cannot be used to enumerate accounts.
    const generic = { ok: true, message: 'If an account exists for that email, a reset link has been sent.' };
    if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows.length) return res.json(generic);
    const token = randomToken(32);
    await db.query(
      `INSERT INTO password_resets (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
      [hashToken(token), rows[0].id]
    );
    const base = process.env.STOREFRONT_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const resetUrl = `${String(base).replace(/\/+$/, '')}/account/reset?token=${encodeURIComponent(token)}`;
    await notifyPasswordReset(email, resetUrl);
    const dev = String(process.env.NODE_ENV || '') !== 'production';
    res.json({ ...generic, ...(dev ? { devResetUrl: resetUrl } : {}) });
  } catch (err) {
    console.error('[auth] forgot error:', err.message);
    res.status(500).json({ error: 'Could not start a password reset' });
  }
});

// POST /store/auth/reset-password { token, password }
router.post('/reset-password', async (req, res) => {
  try {
    const token = String((req.body || {}).token || '');
    const password = (req.body || {}).password;
    if (!token) return res.status(400).json({ error: 'Reset token is required' });
    if (!validPassword(password)) return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN} characters` });
    const { rows } = await db.query(
      `SELECT r.user_id FROM password_resets r
        WHERE r.token_hash = $1 AND r.used = FALSE AND r.expires_at > NOW()`,
      [hashToken(token)]
    );
    if (!rows.length) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
    await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hashPassword(password), rows[0].user_id]);
    await db.query('UPDATE password_resets SET used = TRUE WHERE token_hash = $1', [hashToken(token)]);
    // A reset invalidates every existing session: a stolen cookie must not survive it.
    await db.query('DELETE FROM sessions WHERE user_id = $1', [rows[0].user_id]);
    res.json({ ok: true, message: 'Password updated. You can sign in now.' });
  } catch (err) {
    console.error('[auth] reset error:', err.message);
    res.status(500).json({ error: 'Could not reset the password' });
  }
});

// POST /store/auth/otp/request { phone }
// Issues a 6-digit code for guest order access. No SMS gateway is wired by default; in
// development the code is returned so the flow is testable. In production without SMS the
// endpoint refuses rather than pretending a code was sent.
router.post('/otp/request', async (req, res) => {
  try {
    const phone = normalizePhone((req.body || {}).phone);
    if (!phone) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
    const recent = await db.query(
      `SELECT id FROM otp_codes
        WHERE phone = $1 AND consumed = FALSE AND created_at > NOW() - INTERVAL '60 seconds'
        LIMIT 1`,
      [phone]
    );
    if (recent.rows.length) {
      return res.status(429).json({ error: 'Please wait a minute before requesting another code' });
    }
    const code = generateOtp();
    await db.query(
      `INSERT INTO otp_codes (phone, code_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
      [phone, hashOtp(phone, code), String(OTP_MINUTES)]
    );
    const smsConfigured = Boolean(process.env.SMS_PROVIDER && process.env.SMS_API_KEY);
    const dev = String(process.env.NODE_ENV || '') !== 'production' || String(process.env.ALLOW_DEV_OTP || '').toLowerCase() === 'true';
    if (!smsConfigured && !dev) {
      return res.status(503).json({
        error: 'Phone login is not configured yet. Sign in to your account instead, or contact support.',
        code: 'SMS_NOT_CONFIGURED',
      });
    }
    console.log(`[auth] OTP for ${phone}: ${code}`);
    res.json({
      ok: true,
      message: smsConfigured ? `We sent a 6-digit code to ${phone}.` : `Development code for ${phone}: ${code}`,
      expiresInMinutes: OTP_MINUTES,
      ...(dev ? { devCode: code } : {}),
    });
  } catch (err) {
    console.error('[auth] otp request error:', err.message);
    res.status(500).json({ error: 'Could not send the code' });
  }
});

// POST /store/auth/otp/verify { phone, code }
router.post('/otp/verify', async (req, res) => {
  try {
    const phone = normalizePhone((req.body || {}).phone);
    const code = String((req.body || {}).code || '').replace(/\D/g, '');
    if (!phone) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit code' });
    const { rows } = await db.query(
      `SELECT id, code_hash, attempts FROM otp_codes
        WHERE phone = $1 AND consumed = FALSE AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );
    if (!rows.length) return res.status(400).json({ error: 'The code expired — request a new one' });
    const record = rows[0];
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts — request a new code' });
    }
    if (!otpMatches(phone, code, record.code_hash)) {
      await db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [record.id]);
      return res.status(401).json({ error: 'That code is not correct' });
    }
    await db.query('UPDATE otp_codes SET consumed = TRUE WHERE id = $1', [record.id]);
    res.json({ ok: true, phone, orderToken: issueOrderToken(phone), expiresInMinutes: 30 });
  } catch (err) {
    console.error('[auth] otp verify error:', err.message);
    res.status(500).json({ error: 'Could not verify the code' });
  }
});

// GET /store/auth/orders — authenticated customer order history.
router.get('/orders', async (req, res) => {
  try {
    const user = await sessionUser(db, bearerToken(req));
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    const { rows } = await db.query(
      `SELECT receipt, status, amount_paise, items, created_at, pay_mode, coupon_code, discount_paise, shipping_paise, notes
         FROM orders WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100`,
      [user.id]
    );
    // Resolve names so the account page shows "Bosch GWS 600", not "bosch-gws-600-grinder".
    const slugs = [...new Set(rows.flatMap((o) => (Array.isArray(o.items) ? o.items.map((it) => it && it.slug) : [])).filter(Boolean))];
    let bySlug = {};
    if (slugs.length) {
      const found = await db.query('SELECT slug, name FROM products WHERE slug = ANY($1)', [slugs]);
      bySlug = Object.fromEntries(found.rows.map((p) => [p.slug, p.name]));
    }
    res.json({
      orders: rows.map((o) => ({
        ...o,
        items: (Array.isArray(o.items) ? o.items : []).map((it) => ({
          ...it,
          name: bySlug[it.slug] || it.slug,
          linePaise: (Number(it.unit_price_paise) || 0) * (Number(it.qty) || 0),
        })),
      })),
    });
  } catch (err) {
    console.error('[auth] orders error:', err.message);
    res.status(500).json({ error: 'Could not load orders' });
  }
});

function addressPayload(body) {
  const label = clampText((body || {}).label, 40) || 'Home';
  const name = clampText((body || {}).name, 120);
  const phone = normalizePhone((body || {}).phone);
  const address = clampText((body || {}).address, 500);
  const pincode = String((body || {}).pincode || '').replace(/\D/g, '');
  const state = resolveState((body || {}).stateCode || (body || {}).state || '');
  return { label, name, phone, address, pincode, state, rawState: (body || {}).state };
}

// GET /store/auth/addresses
router.get('/addresses', async (req, res) => {
  try {
    const user = await sessionUser(db, bearerToken(req));
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    res.json({ addresses: await addressesFor(user.id) });
  } catch (err) {
    console.error('[auth] addresses error:', err.message);
    res.status(500).json({ error: 'Could not load addresses' });
  }
});

// POST /store/auth/addresses
router.post('/addresses', async (req, res) => {
  try {
    const user = await sessionUser(db, bearerToken(req));
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    const a = addressPayload(req.body);
    if (!a.name || !a.phone || !a.address || !/^\d{6}$/.test(a.pincode) || !a.state) {
      return res.status(400).json({ error: 'Name, phone, address, 6-digit pincode and state are required' });
    }
    const makeDefault = Boolean((req.body || {}).isDefault) || (await addressesFor(user.id)).length === 0;
    const { rows } = await db.query(
      `INSERT INTO addresses (user_id, label, name, phone, address, pincode, state_code, state, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, label, name, phone, address, pincode, state_code, state, is_default`,
      [user.id, a.label, a.name, a.phone, a.address, a.pincode, a.state.code, a.state.name, makeDefault]
    );
    if (makeDefault) {
      await db.query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1 AND id <> $2', [user.id, rows[0].id]);
    }
    res.status(201).json({ address: rows[0] });
  } catch (err) {
    console.error('[auth] address create error:', err.message);
    res.status(500).json({ error: 'Could not save the address' });
  }
});

// PUT /store/auth/addresses/:id
router.put('/addresses/:id', async (req, res) => {
  try {
    const user = await sessionUser(db, bearerToken(req));
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid address id' });
    const a = addressPayload(req.body);
    if (!a.name || !a.phone || !a.address || !/^\d{6}$/.test(a.pincode) || !a.state) {
      return res.status(400).json({ error: 'Name, phone, address, 6-digit pincode and state are required' });
    }
    const { rows } = await db.query(
      `UPDATE addresses SET label = $1, name = $2, phone = $3, address = $4, pincode = $5,
              state_code = $6, state = $7, is_default = $8
        WHERE id = $9 AND user_id = $10
        RETURNING id, label, name, phone, address, pincode, state_code, state, is_default`,
      [a.label, a.name, a.phone, a.address, a.pincode, a.state.code, a.state.name, Boolean((req.body || {}).isDefault), id, user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Address not found' });
    if (rows[0].is_default) {
      await db.query('UPDATE addresses SET is_default = FALSE WHERE user_id = $1 AND id <> $2', [user.id, id]);
    }
    res.json({ address: rows[0] });
  } catch (err) {
    console.error('[auth] address update error:', err.message);
    res.status(500).json({ error: 'Could not update the address' });
  }
});

// DELETE /store/auth/addresses/:id
router.delete('/addresses/:id', async (req, res) => {
  try {
    const user = await sessionUser(db, bearerToken(req));
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid address id' });
    const { rows } = await db.query('DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id', [id, user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Address not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] address delete error:', err.message);
    res.status(500).json({ error: 'Could not delete the address' });
  }
});

module.exports = router;
