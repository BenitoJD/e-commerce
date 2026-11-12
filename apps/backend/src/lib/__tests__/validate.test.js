const test = require('node:test');
const assert = require('node:assert/strict');
const { clampText, clampInt, normalizePhone } = require('../validate');

test('clampText trims and truncates without producing undefined', () => {
  assert.equal(clampText('  hello  ', 20), 'hello');
  assert.equal(clampText('abcdef', 3), 'abc');
  assert.equal(clampText(null, 5), '');
  assert.equal(clampText(undefined, 5, { fallback: 'x' }), 'x');
  assert.equal(clampText(12345, 10), '12345');
  assert.equal(clampText('keep  inner  spaces', 100), 'keep  inner  spaces');
});

test('clampInt bounds values and falls back on junk', () => {
  assert.equal(clampInt('5', { min: 1, max: 10 }), 5);
  assert.equal(clampInt('-5', { min: 1, max: 10 }), 1); // the old quote bug
  assert.equal(clampInt('999', { min: 1, max: 10 }), 10);
  assert.equal(clampInt('abc', { min: 1, max: 10, fallback: 1 }), 1);
  assert.equal(clampInt(null, { fallback: 7 }), 7);
  assert.equal(clampInt('3.9', { min: 1, max: 10 }), 3);
});

test('normalizePhone accepts Indian formats and rejects rubbish', () => {
  assert.equal(normalizePhone('9876543210'), '9876543210');
  assert.equal(normalizePhone('+91 98765 43210'), '9876543210');
  assert.equal(normalizePhone('098765-43210'), '9876543210');
  assert.equal(normalizePhone('919876543210'), '9876543210');
  assert.equal(normalizePhone('12345'), '');
  assert.equal(normalizePhone('hello'), '');
  assert.equal(normalizePhone(null), '');
  assert.equal(normalizePhone(''), '');
});
