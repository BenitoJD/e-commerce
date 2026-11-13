import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidGstin, normalizeGstin } from '../lib/gstin.js';

test('client GSTIN check agrees with the server on valid numbers', () => {
  assert.equal(isValidGstin('27AAPFU0939F1ZV'), true);
  assert.equal(isValidGstin('29AAGCB7383J1Z4'), true);
  assert.equal(isValidGstin(' 27aapfu-0939f1zv '), true);
});

test('client GSTIN check rejects typos and shapes the server rejects', () => {
  assert.equal(isValidGstin('27AAPFU0939F1ZX'), false, 'wrong check digit');
  assert.equal(isValidGstin('00AAPFU0939F1ZV'), false, 'unassigned state code');
  assert.equal(isValidGstin('27AAPFU0939F1YV'), false, 'missing Z separator');
  assert.equal(isValidGstin('27A1PFU0939F1ZV'), false, 'digit inside PAN block');
  assert.equal(isValidGstin(''), false);
  assert.equal(isValidGstin(null), false);
});

test('normalizeGstin strips separators', () => {
  assert.equal(normalizeGstin(' 27 aapfu-0939f1zv '), '27AAPFU0939F1ZV');
  assert.equal(normalizeGstin(undefined), '');
});
