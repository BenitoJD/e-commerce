const test = require('node:test');
const assert = require('node:assert/strict');
const { codMaxPaise, codAvailableFor } = require('../policy');

test('COD cap defaults to ₹20,000 and honours COD_MAX_PAISE', () => {
  assert.equal(codMaxPaise({}), 2000000);
  assert.equal(codMaxPaise({ COD_MAX_PAISE: '5000000' }), 5000000);
  // junk or non-positive values fall back instead of disabling COD entirely
  assert.equal(codMaxPaise({ COD_MAX_PAISE: 'abc' }), 2000000);
  assert.equal(codMaxPaise({ COD_MAX_PAISE: '0' }), 2000000);
  assert.equal(codMaxPaise({ COD_MAX_PAISE: '-100' }), 2000000);
});

test('codAvailableFor compares the basket against the same cap', () => {
  const env = { COD_MAX_PAISE: '5000000' };
  assert.equal(codAvailableFor(4999900, env), true);
  assert.equal(codAvailableFor(5000000, env), true); // exactly at the cap is allowed
  assert.equal(codAvailableFor(5000001, env), false);
  // default cap applies when the env is absent
  assert.equal(codAvailableFor(2000000, {}), true);
  assert.equal(codAvailableFor(2000001, {}), false);
  // no basket yet -> don't claim COD is unavailable
  assert.equal(codAvailableFor(0), true);
  assert.equal(codAvailableFor(null), true);
  assert.equal(codAvailableFor('not a number'), true);
});
