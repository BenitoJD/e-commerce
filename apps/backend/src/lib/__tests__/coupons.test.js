const test = require('node:test');
const assert = require('node:assert/strict');
const coupons = require('../../../data/coupons');

test('seed ships usable default coupons', () => {
  assert.ok(Array.isArray(coupons) && coupons.length >= 2);
});

test('coupons are valid, unique, paise-denominated', () => {
  const codes = new Set();
  for (const c of coupons) {
    assert.equal(typeof c.code, 'string');
    assert.ok(c.code.length > 0);
    assert.ok(!codes.has(c.code.toUpperCase()), `duplicate code ${c.code}`);
    codes.add(c.code.toUpperCase());
    assert.ok(Number.isInteger(c.pct_off) && c.pct_off >= 1 && c.pct_off <= 90);
    for (const k of ['max_discount_paise', 'min_order_paise']) {
      assert.ok(Number.isInteger(c[k]) && c[k] >= 0, `${c.code}.${k}`);
    }
    assert.equal(typeof c.active, 'boolean');
  }
});
