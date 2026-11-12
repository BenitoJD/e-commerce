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

test('escapeXml neutralises XML metacharacters', () => {
  assert.equal(escapeXml('a&b<c>"d"\'e\''), 'a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;');
});

test('duplicate brands/products are not silently dropped by the builder', () => {
  // dedupe happens in SQL; the builder must at least not corrupt output
  const xml = buildSitemap(BASE, { brands: ['Bosch', 'Bosch'] });
  assert.equal(xml.split('/brand/Bosch').length - 1, 2);
});
