import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePicking } from '../lib/picking.js';

const order = (receipt, items) => ({ receipt, items });

test('aggregatePicking merges the same SKU across orders', () => {
  const result = aggregatePicking([
    order('r1', [{ slug: 'drill', name: 'Drill', hsn: '8467', qty: 2 }]),
    order('r2', [{ slug: 'drill', name: 'Drill', hsn: '8467', qty: 3 }]),
    order('r3', [{ slug: 'pump', name: 'Pump', hsn: '8413', qty: 1 }]),
  ]);
  assert.equal(result.orderCount, 3);
  assert.equal(result.totalUnits, 6);
  const drill = result.rows.find((r) => r.slug === 'drill');
  assert.equal(drill.qty, 5);
  assert.equal(drill.lines, 2);
  assert.deepEqual(result.rows.map((r) => r.slug), ['drill', 'pump'], 'sorted by name');
});

test('aggregatePicking ignores junk and zero quantities', () => {
  const result = aggregatePicking([
    null,
    {},
    order('r1', [null, {}, { slug: 'x', qty: 0 }, { slug: 'y', qty: '2' }]),
  ]);
  assert.equal(result.orderCount, 2, 'null orders are not counted');
  assert.equal(result.totalUnits, 2);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].slug, 'y');
});

test('aggregatePicking handles an empty batch', () => {
  assert.deepEqual(aggregatePicking([]), { orderCount: 0, rows: [], totalUnits: 0 });
  assert.deepEqual(aggregatePicking(null), { orderCount: 0, rows: [], totalUnits: 0 });
});
