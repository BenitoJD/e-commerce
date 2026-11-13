const test = require('node:test');
const assert = require('node:assert/strict');
const { STATES, resolveState } = require('../../../data/states');

test('state list has unique codes and names', () => {
  const codes = STATES.map((s) => s.code);
  assert.equal(new Set(codes).size, codes.length, 'duplicate state codes');
  const names = STATES.map((s) => s.name);
  assert.equal(new Set(names).size, names.length, 'duplicate state names');
  for (const s of STATES) {
    assert.match(s.code, /^[0-9]{2}$/);
    assert.ok(s.name.length > 2);
  }
});

test('codes are within the assigned GST range and include the big markets', () => {
  for (const s of STATES) {
    const n = Number(s.code);
    assert.ok(n >= 1 && n <= 38, `${s.code} outside 01-38`);
  }
  assert.equal(resolveState('27').name, 'Maharashtra');
  assert.equal(resolveState('07').name, 'Delhi');
  assert.equal(resolveState('29').name, 'Karnataka');
  assert.equal(resolveState('33').name, 'Tamil Nadu');
});

test('resolveState accepts codes and names, rejects junk', () => {
  assert.equal(resolveState('27').code, '27');
  assert.equal(resolveState('7').code, '07', 'single digit pads to 07');
  assert.equal(resolveState('maharashtra').code, '27');
  assert.equal(resolveState('  West Bengal ').code, '19');
  assert.equal(resolveState('Atlantis'), null);
  assert.equal(resolveState('99'), null);
  assert.equal(resolveState(''), null);
  assert.equal(resolveState(null), null);
});
