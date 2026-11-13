const test = require('node:test');
const assert = require('node:assert/strict');
const { clampText, clampInt, normalizePhone, normalizeGstin, isValidGstin } = require('../validate');

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

test('isValidGstin accepts published-valid GSTINs and rejects typos', () => {
  // Two independently published valid numbers (checksum verified by hand against the
  // mod-36 algorithm), so a regression in the implementation shows up immediately.
  assert.equal(isValidGstin('27AAPFU0939F1ZV'), true);
  assert.equal(isValidGstin('29AAGCB7383J1Z4'), true);
  // Normalisation: spaces and lowercase are tolerated.
  assert.equal(isValidGstin(' 27aapfu0939f1zv '), true);

  // Wrong check character (the classic transcription typo).
  assert.equal(isValidGstin('27AAPFU0939F1ZX'), false);
  // Bad state code (00 and 99 are not assigned).
  assert.equal(isValidGstin('00AAPFU0939F1ZV'), false);
  assert.equal(isValidGstin('99AAPFU0939F1ZV'), false);
  // Wrong shape: PAN block must be letters, then 4 digits, then a letter.
  assert.equal(isValidGstin('27A1PFU0939F1ZV'), false);
  assert.equal(isValidGstin('27AAPFU939F1ZV'), false);
  // Missing the mandatory 'Z'.
  assert.equal(isValidGstin('27AAPFU0939F1YV'), false);
  // Junk and empty.
  assert.equal(isValidGstin(''), false);
  assert.equal(isValidGstin(null), false);
  assert.equal(isValidGstin('not-a-gstin'), false);
});

test('normalizeGstin strips separators and upper-cases', () => {
  assert.equal(normalizeGstin(' 27 aapfu-0939f1zv '), '27AAPFU0939F1ZV');
  assert.equal(normalizeGstin(null), '');
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
