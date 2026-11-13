// Authentication primitives: password hashing, session tokens, OTP codes and short-lived
// order-access tokens. No external auth dependency — node:crypto only.
const crypto = require('crypto');

const SESSION_DAYS = 30;
const OTP_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const ORDER_TOKEN_MINUTES = 30;

function authSecret(env = process.env) {
  return String(env.AUTH_SECRET || env.RAZORPAY_WEBHOOK_SECRET || 'dev-auth-secret-change-me');
}

// scrypt with a per-password salt. Format: scrypt$N$salt$hash (hex).
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const N = 16384;
  const hash = crypto.scryptSync(String(password), salt, 64, { N, r: 8, p: 1 }).toString('hex');
  return `scrypt$${N}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, n, salt, hash] = String(stored || '').split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    const actual = crypto.scryptSync(String(password), salt, expected.length, { N: Number(n) || 16384, r: 8, p: 1 });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function createSession(db, userId, { days = SESSION_DAYS } = {}) {
  const token = randomToken(32);
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' days')::interval)`,
    [hashToken(token), userId, String(days)]
  );
  return { token, userId, expiresAt: new Date(Date.now() + days * 864e5).toISOString() };
}

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header));
  return match ? match[1].trim() : '';
}

async function sessionUser(db, token) {
  if (!token) return null;
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.phone, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

async function userFromRequest(db, req) {
  return sessionUser(db, bearerToken(req));
}

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashOtp(phone, code, env = process.env) {
  return crypto.createHmac('sha256', authSecret(env))
    .update(`${String(phone)}:${String(code)}`)
    .digest('hex');
}

function otpMatches(phone, code, storedHash, env = process.env) {
  const expected = Buffer.from(hashOtp(phone, code, env), 'hex');
  const actual = Buffer.from(String(storedHash || ''), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Signed, stateless proof that a phone number was verified moments ago. Used to gate the
// guest order-history/cancel endpoints; without it, knowing a phone number was enough to
// list a stranger's orders (receipts, amounts) and cancel them.
function issueOrderToken(phone, { minutes = ORDER_TOKEN_MINUTES, env = process.env } = {}) {
  const payload = `${String(phone)}.${Date.now() + minutes * 60000}`;
  const sig = crypto.createHmac('sha256', authSecret(env)).update(payload).digest('base64url');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

function verifyOrderToken(token, env = process.env) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const payload = Buffer.from(body, 'base64url').toString('utf8');
    const expected = crypto.createHmac('sha256', authSecret(env)).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const [phone, exp] = payload.split('.');
    if (!/^\d{10}$/.test(phone) || Number(exp) < Date.now()) return null;
    return { phone, expiresAt: Number(exp) };
  } catch {
    return null;
  }
}

module.exports = {
  SESSION_DAYS,
  OTP_MINUTES,
  OTP_MAX_ATTEMPTS,
  ORDER_TOKEN_MINUTES,
  hashPassword,
  verifyPassword,
  randomToken,
  hashToken,
  createSession,
  bearerToken,
  sessionUser,
  userFromRequest,
  generateOtp,
  hashOtp,
  otpMatches,
  issueOrderToken,
  verifyOrderToken,
  authSecret,
};
