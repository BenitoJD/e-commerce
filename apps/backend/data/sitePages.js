// The canonical list of sitemap entries that don't come from the database: the fixed pages
// plus every category path from the taxonomy. Shared by the backend route and the fixture
// backend the live audit runs against, so the two can never advertise different URL sets.
const { allCategoryPaths } = require('./categories');

const CATEGORY_PAGES = ['/category/all', ...allCategoryPaths().map((p) => `/category/${p}`)];

const STATIC_PAGES = [
  '/deals',
  '/brands',
  '/bulk-quote',
  '/bulk-orders',
  '/emi-options',
  '/faq',
  '/contact-us',
  '/about-us',
  '/shipping-policy',
  '/returns-policy',
  '/cancellation-policy',
  // NOTE: /returns is deliberately absent, that page is a private RMA form marked
  // `noindex, nofollow`, and a sitemap must not advertise pages we ask crawlers to ignore.
  '/warranty-policy',
  '/privacy-policy',
  '/terms-conditions',
  ...CATEGORY_PAGES,
];

module.exports = { STATIC_PAGES, CATEGORY_PAGES };
