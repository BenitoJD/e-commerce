const db = require('../db');

const STATIC_PAGES = [
  '/deals',
  '/brands',
  '/track-order',
  '/bulk-quote',
  '/bulk-orders',
  '/emi-options',
  '/contact-us',
  '/about-us',
  '/shipping-policy',
  '/returns-policy',
  '/warranty-policy',
  '/privacy-policy',
  '/terms-conditions',
];

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// GET /sitemap.xml
async function sitemapHandler(req, res) {
  try {
    const base = String(
      process.env.FRONTEND_URL || process.env.STOREFRONT_URL || 'https://www.example.com'
    ).replace(/\/+$/, '');
    let slugs = [];
    try {
      const { rows } = await db.query('SELECT slug FROM products ORDER BY slug ASC');
      slugs = rows.map((r) => r.slug).filter(Boolean);
    } catch (err) {
      console.error('[sitemap] products lookup failed:', err.message);
    }
    const urls = [
      '/',
      ...STATIC_PAGES,
      ...slugs.map((s) => `/product/${encodeURIComponent(s)}`),
    ];
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${escapeXml(base + u)}</loc></url>`).join('\n') +
      `\n</urlset>`;
    res.type('application/xml').send(body);
  } catch (err) {
    console.error('[sitemap] error:', err.message);
    res.status(500).type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>');
  }
}

module.exports = sitemapHandler;
