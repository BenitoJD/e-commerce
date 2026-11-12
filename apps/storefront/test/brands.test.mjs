import test from 'node:test';
import assert from 'node:assert/strict';
import { brandSummary } from '../lib/brands.js';

test('brandSummary counts products per brand, alphabetically', () => {
  const summary = brandSummary([
    { brand: 'Bosch' }, { brand: 'Bosch' }, { brand: 'Makita' }, { brand: 'abb' },
  ]);
  assert.deepEqual(summary, [
    { name: 'abb', count: 1 },
    { name: 'Bosch', count: 2 },
    { name: 'Makita', count: 1 },
  ]);
});

test('brandSummary trims names, skips blanks and tolerates junk input', () => {
  const summary = brandSummary([
    { brand: '  Bosch  ' }, { brand: '   ' }, { brand: '' }, {}, null,
  ]);
  assert.deepEqual(summary, [{ name: 'Bosch', count: 1 }]);
  assert.deepEqual(brandSummary(null), []);
  assert.deepEqual(brandSummary(undefined), []);
  assert.deepEqual(brandSummary('not an array'), []);
  assert.deepEqual(brandSummary([{ brand: 42 }]), [{ name: '42', count: 1 }]);
});
