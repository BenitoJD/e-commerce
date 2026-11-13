// Small security helpers shared by the API entrypoint and tests.
const crypto = require('crypto');

// Constant-time string comparison (guards the admin token against timing attacks).
// Length is compared first only to pick the buffer size; the HMAC trick below keeps
// even that from leaking useful timing information.
function safeEqualStrings(a, b) {
  const left = crypto.createHash('sha256').update(String(a == null ? '' : a)).digest();
  const right = crypto.createHash('sha256').update(String(b == null ? '' : b)).digest();
  return crypto.timingSafeEqual(left, right);
}

// FRONTEND_URL may hold one origin or a comma-separated list ("https://shop.test,https://www.shop.test").
function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// CORS policy. With an allowlist configured, only those origins may call the API from a
// browser. Without one, development keeps the permissive behaviour, but PRODUCTION must not
// fall back to "*": that lets any website call the store's API. The single-domain deployment
// proxies /api through nginx, so same-origin requests need no CORS headers at all — an empty
// list simply blocks cross-origin callers until the operator sets FRONTEND_URL.
function corsOrigin(env = process.env) {
  const origins = parseOrigins(env.FRONTEND_URL);
  if (origins.length) return origins;
  return String(env.NODE_ENV || '') === 'production' ? [] : '*';
}

// Boot-time notice: a production API without an allowlist is probably a misconfiguration.
function corsWarning(env = process.env) {
  if (parseOrigins(env.FRONTEND_URL).length) return null;
  if (String(env.NODE_ENV || '') !== 'production') return null;
  return '[security] FRONTEND_URL is not set — cross-origin browser requests are blocked. '
    + 'Set it to your storefront origin (e.g. https://yourdomain.com) if the API is called '
    + 'from another origin.';
}

// Baseline response headers. HSTS is only meaningful over TLS, so it is emitted when
// the request arrived via https (directly or through a proxy that set X-Forwarded-Proto).
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (req.secure || proto === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

module.exports = { parseOrigins, securityHeaders, safeEqualStrings, corsOrigin, corsWarning };
