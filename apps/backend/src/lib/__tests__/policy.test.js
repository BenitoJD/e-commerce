const test = require('node:test');
const assert = require('node:assert/strict');
const { codMaxPaise, codAvailableFor, shippingFeePaise } = require('../policy');

test('COD cap defaults to ₹20,000 and honours COD_MAX_PAISE', () => {
  assert.equal(codMaxPaise({}), 2000000);
  assert.equal(codMaxPaise({ COD_MAX_PAISE: '5000000' }), 5000000);
  // junk or non-positive values fall back instead of disabling COD entirely
  assert.equal(codMaxPaise({ COD_MAX_PAISE: 'abc' }), 2000000);
  assert.equal(codMaxPaise({ COD_MAX_PAISE: '0' }), 2000000);
  assert.equal(codMaxPaise({ COD_MAX_PAISE: '-100' }), 2000000);
});

test('shipping is free by default and configurable when the operator opts in', () => {
  // Default: free shipping everywhere (no surprise charges on existing prices)
  assert.equal(shippingFeePaise(100000, {}), 0);
  assert.equal(shippingFeePaise(100000, { SHIPPING_FEE_PAISE: '0' }), 0);
  assert.equal(shippingFeePaise(100000, { SHIPPING_FEE_PAISE: 'abc' }), 0);

  const feeEnv = { SHIPPING_FEE_PAISE: '14900', FREE_SHIPPING_ABOVE_PAISE: '499900' };
  assert.equal(shippingFeePaise(100000, feeEnv), 14900, 'below threshold pays the flat fee');
  assert.equal(shippingFeePaise(499900, feeEnv), 0, 'exactly at the threshold ships free');
  assert.equal(shippingFeePaise(900000, feeEnv), 0);
  assert.equal(shippingFeePaise(499899, feeEnv), 14900);

  // a fee with no threshold charges on every order
  assert.equal(shippingFeePaise(999999, { SHIPPING_FEE_PAISE: '9900' }), 9900);
  // junk subtotal still charges the configured fee rather than becoming NaN
  assert.equal(shippingFeePaise(null, { SHIPPING_FEE_PAISE: '9900' }), 9900);
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
