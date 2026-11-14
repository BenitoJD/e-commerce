import test from 'node:test';
import assert from 'node:assert/strict';
import { discountPct, pickDeals, DEAL_THRESHOLD } from '../lib/deals.js';

test('discountPct: rounds correctly and never returns NaN', () => {
  assert.equal(discountPct({ price: 100, mrp: 200 }), 50);
  assert.equal(discountPct({ price: 1000, mrp: 1299 }), 23); // 299/1299 = 23.0%
  assert.equal(discountPct({ price: 100, mrp: 100 }), 0); // no discount
  assert.equal(discountPct({ price: 100, mrp: 50 }), 0); // mrp below price (bad data)
  assert.equal(discountPct({ price: 100 }), 0);
  assert.equal(discountPct({}), 0);
  assert.equal(discountPct(null), 0);
  assert.equal(discountPct({ price: 'abc', mrp: 'xyz' }), 0);
  assert.equal(Number.isNaN(discountPct({ price: 'abc', mrp: 200 })), false);
});

test('pickDeals filters at the threshold and sorts by discount', () => {
  const items = [
    { slug: 'a', price: 100, mrp: 200 }, // 50%
    { slug: 'b', price: 100, mrp: 110 }, // 9%, excluded
    { slug: 'c', price: 300, mrp: 400 }, // 25%
    { slug: 'd', price: 100, mrp: 125 }, // 20%, exactly at threshold
  ];
  const deals = pickDeals(items);
  assert.deepEqual(deals.map((d) => d.slug), ['a', 'c', 'd']);
  assert.equal(deals[0].discountPct, 50);
  assert.equal(DEAL_THRESHOLD, 20);

  // tolerant of non-arrays
  assert.deepEqual(pickDeals(null), []);
  assert.deepEqual(pickDeals(undefined), []);
  // custom threshold
  assert.deepEqual(pickDeals(items, 40).map((d) => d.slug), ['a']);
});
