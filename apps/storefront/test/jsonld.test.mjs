import test from 'node:test';
import assert from 'node:assert/strict';
import { productJsonLd, organizationJsonLd, websiteJsonLd, breadcrumbJsonLd } from '../lib/jsonld.js';

const product = {
  slug: 'bosch-drill', name: 'Bosch Drill <600W>', brand: 'Bosch', hsn: '84672100',
  price_paise: 549500, stock: 3, images: ['/images/a.svg', '/images/b.svg', '/images/c.svg', '/images/d.svg'],
};
const opts = {
  storeName: 'E-Commerce',
  absoluteUrl: (p) => `https://shop.test${p}`,
  paiseToRupees: (paise) => Math.round(Number(paise || 0) / 100),
};

test('product JSON-LD carries the fields rich results need', () => {
  const ld = JSON.parse(productJsonLd(product, opts));
  assert.equal(ld['@type'], 'Product');
  assert.equal(ld.name, 'Bosch Drill <600W>');
  assert.equal(ld.sku, 'bosch-drill');
  assert.equal(ld.brand.name, 'Bosch');
  assert.equal(ld.offers.priceCurrency, 'INR');
  assert.equal(ld.offers.price, '5495');
  assert.equal(ld.offers.availability, 'https://schema.org/InStock');
  assert.equal(ld.offers.itemCondition, 'https://schema.org/NewCondition');
  assert.equal(ld.offers.url, 'https://shop.test/product/bosch-drill');
  assert.equal(ld.image.length, 3, 'at most three images');
});

test('out-of-stock products advertise OutOfStock', () => {
  const ld = JSON.parse(productJsonLd({ ...product, stock: 0 }, opts));
  assert.equal(ld.offers.availability, 'https://schema.org/OutOfStock');
});

test('aggregateRating appears only when real reviews exist', () => {
  const none = JSON.parse(productJsonLd(product, opts));
  assert.equal(none.aggregateRating, undefined);
  const zero = JSON.parse(productJsonLd(product, { ...opts, rating: { avg: 0, count: 0 } }));
  assert.equal(zero.aggregateRating, undefined);

  const rated = JSON.parse(productJsonLd(product, { ...opts, rating: { avg: 4.26, count: 7 } }));
  assert.deepEqual(rated.aggregateRating, {
    '@type': 'AggregateRating', ratingValue: '4.3', reviewCount: '7', bestRating: '5', worstRating: '1',
  });
  // never above 5 even if the data is bad
  const bad = JSON.parse(productJsonLd(product, { ...opts, rating: { avg: 9, count: 2 } }));
  assert.equal(bad.aggregateRating.ratingValue, '5');
});

test('organization JSON-LD exposes brand identity and support contact', () => {
  const store = { name: 'E-Commerce', email: 'care@shop.test', phoneDigits: '919999999999' };
  const ld = JSON.parse(organizationJsonLd({ store, siteUrl: 'https://shop.test/' }));
  assert.equal(ld['@type'], 'Organization');
  assert.equal(ld.name, 'E-Commerce');
  assert.equal(ld.url, 'https://shop.test'); // trailing slash normalised
  assert.equal(ld.logo, 'https://shop.test/favicon.svg');
  assert.equal(ld.contactPoint[0].telephone, '+919999999999');
  // no phone configured -> no bogus contact point
  const bare = JSON.parse(organizationJsonLd({ store: { name: 'X' }, siteUrl: 'https://x.test' }));
  assert.equal(bare.contactPoint, undefined);
});

test('website JSON-LD advertises the search box action', () => {
  const ld = JSON.parse(websiteJsonLd({ store: { name: 'E-Commerce' }, siteUrl: 'https://shop.test' }));
  assert.equal(ld['@type'], 'WebSite');
  assert.equal(ld.potentialAction['@type'], 'SearchAction');
  assert.equal(ld.potentialAction.target, 'https://shop.test/category/all?q={search_term_string}');
  assert.equal(ld.potentialAction['query-input'], 'required name=search_term_string');
});

test('breadcrumb JSON-LD numbers positions and drops malformed entries', () => {
  const ld = JSON.parse(breadcrumbJsonLd([
    { name: 'Home', url: 'https://shop.test/' },
    { name: 'Power Tools', url: 'https://shop.test/category/power-tools' },
    { name: 'Drill', url: 'https://shop.test/product/drill' },
    { name: '', url: 'https://shop.test/blank' }, // dropped
    null,
  ]));
  assert.equal(ld['@type'], 'BreadcrumbList');
  assert.equal(ld.itemListElement.length, 3);
  assert.deepEqual(ld.itemListElement.map((i) => i.position), [1, 2, 3]);
  assert.equal(ld.itemListElement[1].name, 'Power Tools');
  // empty input still produces a valid (empty) list rather than throwing
  assert.deepEqual(JSON.parse(breadcrumbJsonLd(null)).itemListElement, []);
});

test('JSON-LD cannot break out of its script tag', () => {
  const raw = productJsonLd({ ...product, name: '</script><script>alert(1)</script>' }, opts);
  assert.equal(raw.includes('</script>'), false);
  assert.ok(raw.includes('\\u003c/script'));
  // still valid JSON after the escape (JSON.parse turns \u003c back into "<")
  assert.equal(JSON.parse(raw).name.includes('</script>'), true);
});
