import test from 'node:test';
import assert from 'node:assert/strict';
import { productJsonLd } from '../lib/jsonld.js';

const product = {
  slug: 'bosch-drill', name: 'Bosch Drill <600W>', brand: 'Bosch', hsn: '84672100',
  price_paise: 549500, stock: 3, images: ['/images/a.svg', '/images/b.svg', '/images/c.svg', '/images/d.svg'],
};
const opts = {
  storeName: 'ToolsKart',
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

test('JSON-LD cannot break out of its script tag', () => {
  const raw = productJsonLd({ ...product, name: '</script><script>alert(1)</script>' }, opts);
  assert.equal(raw.includes('</script>'), false);
  assert.ok(raw.includes('\\u003c/script'));
  // still valid JSON after the escape (JSON.parse turns \u003c back into "<")
  assert.equal(JSON.parse(raw).name.includes('</script>'), true);
});
