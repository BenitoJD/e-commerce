import test from 'node:test';
import assert from 'node:assert/strict';
import { shippingFor, shippingHint } from '../lib/store.js';

test('shippingFor mirrors the fee / threshold policy', () => {
  assert.equal(shippingFor(1000, {}), shippingFor(1000));
  // With the default config (free shipping) every order is free.
  assert.equal(shippingFor(0), 0);
  assert.equal(shippingFor(50000), 0);
});

test('shippingHint nudges toward the free-shipping threshold', () => {
  const cfg = { fee: 99, freeAbove: 3000 };

  const below = shippingHint(1200, cfg);
  assert.equal(below.free, false);
  assert.equal(below.gapRupees, 1800);
  assert.match(below.text, /Add ₹1,800 more for free shipping/);
  assert.match(below.text, /₹99 delivery applies/);

  const exact = shippingHint(3000, cfg);
  assert.equal(exact.free, true);
  assert.match(exact.text, /Free shipping unlocked/);

  const above = shippingHint(4500, cfg);
  assert.equal(above.free, true);
  assert.equal(above.gapRupees, 0);
});

test('shippingHint handles a flat fee with no threshold', () => {
  const r = shippingHint(2500, { fee: 49, freeAbove: 0 });
  assert.equal(r.free, false);
  assert.match(r.text, /₹49 delivery applies/);

  const zero = shippingHint(999, { fee: 0, freeAbove: 0 });
  assert.equal(zero.free, true);
  assert.match(zero.text, /Free shipping across India/);
});

test('shippingHint tolerates junk input', () => {
  const r = shippingHint(null, { fee: 99, freeAbove: 1000 });
  assert.equal(r.free, false);
  assert.equal(r.gapRupees, 1000);
  const neg = shippingHint(-50, { fee: 99, freeAbove: 1000 });
  assert.equal(neg.gapRupees, 1000, 'a negative total is treated as zero');
});
