import test from 'node:test';
import assert from 'node:assert/strict';
import { withRupeePrices } from '../lib/productMapping.js';

// Server-rendered views read rupee fields; the API sends paise. When this mapping was
// missing, product/category/home pages rendered "₹NaN" until a client refetch.
test('withRupeePrices derives rupee fields from paise', () => {
  const out = withRupeePrices({ slug: 'x', price_paise: 349900, mrp_paise: 499500, images: ['/images/x.svg'] });
  assert.equal(out.price, 3499);
  assert.equal(out.mrp, 4995);
  assert.equal(out.image, '/images/x.svg');
  assert.equal(out.id, 'x');
});

test('withRupeePrices never overwrites values the API already sent', () => {
  const out = withRupeePrices({ slug: 'x', price: 100, mrp: 200, price_paise: 999999, image: '/a.svg', images: ['/b.svg'], id: 'custom' });
  assert.equal(out.price, 100);
  assert.equal(out.mrp, 200);
  assert.equal(out.image, '/a.svg');
  assert.equal(out.id, 'custom');
});

test('withRupeePrices tolerates junk without throwing', () => {
  assert.equal(withRupeePrices(null), null);
  assert.deepEqual(withRupeePrices({ slug: 'x', price_paise: 'abc' }).price, 0);
  assert.deepEqual(withRupeePrices({ slug: 'x' }).price, undefined);
});
