// Small security helpers shared by the API entrypoint and tests.

// FRONTEND_URL may hold one origin or a comma-separated list ("https://shop.test,https://www.shop.test").
function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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

module.exports = { parseOrigins, securityHeaders };
