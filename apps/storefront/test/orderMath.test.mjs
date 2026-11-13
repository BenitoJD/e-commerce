import test from 'node:test';
import assert from 'node:assert/strict';
import { sumLinePaise, reconcileOrder } from '../lib/orderMath.js';

test('sumLinePaise totals quantity × unit price', () => {
  const items = [
    { qty: 2, unitPaise: 50000 },      // 100000
    { qty: 1, unitPaise: 30000 },      // 30000
  ];
  assert.equal(sumLinePaise(items), 130000);
  assert.equal(sumLinePaise([]), 0);
  assert.equal(sumLinePaise(null), 0);
  assert.equal(sumLinePaise([null, {}]), 0);
});

test('sumLinePaise prefers a stored line total over recomputing', () => {
  assert.equal(sumLinePaise([{ qty: 2, unitPaise: 100, linePaise: 250 }]), 250);
});

test('reconcileOrder shows items − discount + shipping = total', () => {
  const r = reconcileOrder({
    items: [{ qty: 2, unitPaise: 50000 }],
    discountPaise: 10000,
    shippingPaise: 4900,
    amountPaise: 94900, // 100000 − 10000 + 4900
  });
  assert.equal(r.subtotalPaise, 100000);
  assert.equal(r.expectedPaise, 94900);
  assert.equal(r.totalPaise, 94900);
  assert.equal(r.matches, true);
  assert.equal(r.differencePaise, 0);
});

test('reconcileOrder flags a mismatch instead of hiding it', () => {
  const r = reconcileOrder({
    items: [{ qty: 1, unitPaise: 100000 }],
    discountPaise: 0,
    shippingPaise: 0,
    amountPaise: 90000,
  });
  assert.equal(r.matches, false);
  assert.equal(r.differencePaise, -10000);
});

test('reconcileOrder survives missing fields', () => {
  const r = reconcileOrder({});
  assert.deepEqual(r, {
    subtotalPaise: 0, discountPaise: 0, shippingPaise: 0, totalPaise: 0, expectedPaise: 0, matches: true, differencePaise: 0,
  });
});
