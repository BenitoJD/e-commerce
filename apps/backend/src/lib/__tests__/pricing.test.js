const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  applyCoupon,
  gstSplit,
  emiPerMonth,
  discountPct,
  paiseToINR,
} = require('../pricing');

describe('applyCoupon', () => {
  it('caps discount at max_discount_paise', () => {
    const r = applyCoupon(100000, { pct_off: 20, max_discount_paise: 5000, min_order_paise: 0, active: true });
    assert.strictEqual(r.discountPaise, 5000);
    assert.strictEqual(r.finalPaise, 95000);
  });

  it('applies uncapped pct when below cap', () => {
    const r = applyCoupon(10000, { pct_off: 10, max_discount_paise: 5000, min_order_paise: 0, active: true });
    assert.strictEqual(r.discountPaise, 1000);
    assert.strictEqual(r.finalPaise, 9000);
  });

  it('rejects below min_order_paise', () => {
    const r = applyCoupon(4000, { pct_off: 10, max_discount_paise: 0, min_order_paise: 5000, active: true });
    assert.strictEqual(r.discountPaise, 0);
    assert.strictEqual(r.finalPaise, 4000);
    assert.ok(r.reason);
  });

  it('rejects inactive coupon', () => {
    const r = applyCoupon(10000, { pct_off: 10, max_discount_paise: 0, min_order_paise: 0, active: false });
    assert.strictEqual(r.discountPaise, 0);
    assert.strictEqual(r.finalPaise, 10000);
    assert.match(r.reason, /inactive/i);
  });

  it('handles zero amount', () => {
    const r = applyCoupon(0, { pct_off: 10, max_discount_paise: 1000, min_order_paise: 0, active: true });
    assert.strictEqual(r.discountPaise, 0);
    assert.strictEqual(r.finalPaise, 0);
    assert.ok(r.reason);
  });

  it('never exceeds order amount', () => {
    const r = applyCoupon(500, { pct_off: 90, max_discount_paise: 0, min_order_paise: 0, active: true });
    assert.ok(r.discountPaise <= 500);
    assert.strictEqual(r.finalPaise, 500 - r.discountPaise);
  });

  it('rejects an expired coupon and allows a future one', () => {
    const base = { pct_off: 10, max_discount_paise: 0, min_order_paise: 0, active: true };
    const now = Date.parse('2026-06-01T00:00:00Z');
    const expired = applyCoupon(100000, { ...base, expires_at: '2026-05-31T23:59:59Z' }, now);
    assert.strictEqual(expired.discountPaise, 0);
    assert.match(expired.reason, /expired/i);
    const future = applyCoupon(100000, { ...base, expires_at: '2026-12-31T00:00:00Z' }, now);
    assert.strictEqual(future.discountPaise, 10000);
    assert.strictEqual(future.reason, '');
  });

  it('enforces max_uses and treats null as unlimited', () => {
    const base = { pct_off: 10, max_discount_paise: 0, min_order_paise: 0, active: true, max_uses: 2 };
    assert.strictEqual(applyCoupon(100000, { ...base, used_count: 1 }).discountPaise, 10000);
    const exhausted = applyCoupon(100000, { ...base, used_count: 2 });
    assert.strictEqual(exhausted.discountPaise, 0);
    assert.match(exhausted.reason, /usage limit/i);
    assert.strictEqual(applyCoupon(100000, { ...base, max_uses: null, used_count: 999 }).discountPaise, 10000);
  });
});

describe('gstSplit', () => {
  it('splits inclusive GST and sums back', () => {
    const { base, gst, rate } = gstSplit(11800, 18);
    assert.strictEqual(rate, 18);
    assert.strictEqual(base, 10000);
    assert.strictEqual(gst, 1800);
    assert.strictEqual(base + gst, 11800);
  });

  it('defaults to 18% rate', () => {
    const { rate } = gstSplit(11800);
    assert.strictEqual(rate, 18);
  });
});

describe('emiPerMonth', () => {
  it('rounds up', () => {
    assert.strictEqual(emiPerMonth(100000, 3), 33334);
    assert.strictEqual(emiPerMonth(120000, 12), 10000);
  });

  it('returns 0 for bad months', () => {
    assert.strictEqual(emiPerMonth(100000, 0), 0);
  });
});

describe('discountPct + paiseToINR', () => {
  it('computes discount pct', () => {
    assert.strictEqual(discountPct(100000, 80000), 20);
    assert.strictEqual(discountPct(50000, 50000), 0);
    assert.strictEqual(discountPct(0, 0), 0);
  });

  it('formats paise to INR string', () => {
    const s = paiseToINR(549500);
    assert.ok(typeof s === 'string' && s.length > 0);
    assert.match(s, /5,495/);
  });
});
