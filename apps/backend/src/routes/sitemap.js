const db = require('../db');
const { allCategoryPaths } = require('../../data/categories');

// Category URLs come from the taxonomy (+ the "all products" page) so adding a subcategory
// to data/categories.js publishes it here automatically instead of drifting.
const CATEGORY_PAGES = ['/category/all', ...allCategoryPaths().map((p) => `/category/${p}`)];

const STATIC_PAGES = [
  '/deals',
  '/brands',
  '/bulk-quote',
  '/bulk-orders',
  '/emi-options',
  '/contact-us',
  '/about-us',
  '/shipping-policy',
  '/returns-policy',
  '/cancellation-policy',
  '/returns',
  '/warranty-policy',
  '/privacy-policy',
  '/terms-conditions',
  ...CATEGORY_PAGES,
];

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Pure builder so the XML shape and URL coverage are unit-testable.
function buildSitemap(base, { slugs = [], brands = [], staticPages = STATIC_PAGES } = {}) {
  const urls = [
    '/',
    ...staticPages,
    ...slugs.filter(Boolean).map((s) => `/product/${encodeURIComponent(s)}`),
    ...brands.filter(Boolean).map((b) => `/brand/${encodeURIComponent(b)}`),
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${escapeXml(String(base).replace(/\/+$/, '') + u)}</loc></url>`).join('\n') +
    `\n</urlset>`
  );
}

// GET /sitemap.xml
async function sitemapHandler(req, res) {
  try {
    const base = String(
      process.env.FRONTEND_URL || process.env.STOREFRONT_URL || 'https://www.example.com'
    ).replace(/\/+$/, '');
    let slugs = [];
    let brands = [];
    try {
      const { rows } = await db.query('SELECT slug FROM products ORDER BY slug ASC');
      slugs = rows.map((r) => r.slug).filter(Boolean);
    } catch (err) {
      console.error('[sitemap] products lookup failed:', err.message);
    }
    try {
      const { rows } = await db.query(
        'SELECT DISTINCT brand FROM products WHERE brand <> \'\' ORDER BY brand ASC'
      );
      brands = rows.map((r) => r.brand).filter(Boolean);
    } catch (err) {
      console.error('[sitemap] brand lookup failed:', err.message);
    }
    res.type('application/xml').send(buildSitemap(base, { slugs, brands }));
  } catch (err) {
    console.error('[sitemap] error:', err.message);
    res.status(500).type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>');
  }
}

module.exports = sitemapHandler;
module.exports.buildSitemap = buildSitemap;
module.exports.STATIC_PAGES = STATIC_PAGES;
module.exports.escapeXml = escapeXml;
