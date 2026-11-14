// Resolves the public origin used in sitemap URLs.
//
// FRONTEND_URL is authoritative (it may be a comma-separated allowlist, take the first).
// Without it, fall back to the request's own origin so a self-hosted deployment can never
// advertise placeholder URLs like https://www.example.com to search engines.
function sitemapOrigin(req, env = process.env) {
  const configured = String(env.FRONTEND_URL || env.STOREFRONT_URL || '')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
  if (/^https?:\/\//i.test(configured)) return configured;

  const headers = (req && req.headers) || {};
  const proto = String(headers['x-forwarded-proto'] || '').split(',')[0].trim()
    || (req && req.protocol)
    || 'http';
  const host = String(headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
  if (host) return `${proto}://${host}`;

  return 'https://www.example.com';
}

module.exports = { sitemapOrigin };
