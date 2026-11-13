const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSitemap, escapeXml, STATIC_PAGES } = require('../../routes/sitemap');

const BASE = 'https://shop.test';

test('sitemap includes home, static pages, products and brands', () => {
  const xml = buildSitemap(BASE, { slugs: ['a-drill', 'b-pump'], brands: ['Bosch', 'CRI'] });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(xml.includes(`<loc>${BASE}/</loc>`));
  for (const page of STATIC_PAGES) {
    assert.ok(xml.includes(`<loc>${BASE}${page}</loc>`), `missing ${page}`);
  }
  assert.ok(xml.includes(`<loc>${BASE}/product/a-drill</loc>`));
  assert.ok(xml.includes(`<loc>${BASE}/brand/Bosch</loc>`));
  assert.ok(xml.includes(`<loc>${BASE}/brand/CRI</loc>`));
});

test('sitemap percent-encodes slugs and brands with spaces', () => {
  const xml = buildSitemap(BASE, { slugs: ['heavy duty drill'], brands: ['Black+Decker'] });
  assert.ok(xml.includes('/product/heavy%20duty%20drill'));
  assert.ok(xml.includes('/brand/Black%2BDecker'));
});

test('sitemap escapes XML and tolerates empty input', () => {
  const xml = buildSitemap(`${BASE}/`, {});
  assert.ok(xml.includes(`<loc>${BASE}/</loc>`));
  assert.ok(!xml.includes('//</loc>'));
  assert.ok(xml.trim().endsWith('</urlset>'));
});

test('sitemap never advertises pages that robots.txt blocks', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const robotsPath = path.join(__dirname, '..', '..', '..', '..', 'storefront', 'app', 'robots.js');
  const robots = fs.readFileSync(robotsPath, 'utf8');
  // The disallow list is a literal array in that file; read it without executing ESM.
  const disallowBlock = robots.slice(robots.indexOf('disallow:'), robots.indexOf(']', robots.indexOf('disallow:')));
  const disallowed = [...disallowBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);

  assert.ok(disallowed.length >= 5, 'expected a robots disallow list');
  const overlap = STATIC_PAGES.filter((page) => disallowed.includes(page));
  assert.deepEqual(overlap, [], `sitemap lists robots-blocked pages: ${overlap.join(', ')}`);
});

test('sitemap includes the published policy pages', () => {
  const xml = buildSitemap('https://shop.test');
  for (const page of ['/returns-policy', '/shipping-policy', '/warranty-policy', '/cancellation-policy', '/privacy-policy', '/terms-conditions']) {
    assert.ok(xml.includes(`https://shop.test${page}<`), `sitemap missing ${page}`);
  }
});

test('sitemap lists every parent and child category from the taxonomy', () => {
  const { allCategoryPaths } = require('../../../data/categories');
  const xml = buildSitemap('https://shop.test');
  for (const path of allCategoryPaths()) {
    assert.ok(xml.includes(`https://shop.test/category/${path}<`), `sitemap missing /category/${path}`);
  }
  assert.ok(xml.includes('https://shop.test/category/all<'), 'the all-products page stays listed');
  // No duplicates: a category appearing twice is a signal the list is assembled twice.
  const categoryUrls = [...xml.matchAll(/https:\/\/shop\.test\/category\/[^<]+</g)].map((m) => m[0]);
  assert.equal(new Set(categoryUrls).size, categoryUrls.length, 'duplicate category URLs in the sitemap');
});

test('sitemap omits private and transactional pages', () => {
  for (const priv of ['/my-orders', '/track-order', '/wishlist', '/cart', '/checkout', '/admin']) {
    assert.equal(STATIC_PAGES.includes(priv), false, `${priv} must not be in the sitemap`);
  }
});

test('escapeXml neutralises XML metacharacters', () => {
  assert.equal(escapeXml('a&b<c>"d"\'e\''), 'a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;');
});

test('duplicate brands/products are not silently dropped by the builder', () => {
  // dedupe happens in SQL; the builder must at least not corrupt output
  const xml = buildSitemap(BASE, { brands: ['Bosch', 'Bosch'] });
  assert.equal(xml.split('/brand/Bosch').length - 1, 2);
});
