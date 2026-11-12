const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldAutoRefund } = require('../refunds');

function withKeys(id, secret, fn) {
  const oldId = process.env.RAZORPAY_KEY_ID;
  const oldSecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID = id;
  process.env.RAZORPAY_KEY_SECRET = secret;
  try {
    fn();
  } finally {
    if (oldId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = oldId;
    if (oldSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = oldSecret;
  }
}

test('no payment id -> manual', () => {
  withKeys('rzp_live_x', 's', () => {
    const r = shouldAutoRefund({ receipt: 'r1', amount_paise: 100 });
    assert.equal(r.attempt, false);
  });
});

test('mock payment -> manual (never hits gateway)', () => {
  withKeys('rzp_live_x', 's', () => {
    const r = shouldAutoRefund({ receipt: 'r1', razorpay_payment_id: 'order_mock_123', amount_paise: 100 });
    assert.equal(r.attempt, false);
    assert.match(r.reason, /mock/);
  });
});

test('placeholder keys -> manual (local dev safe)', () => {
  withKeys('rzp_test_xxxx', 'xxxx', () => {
    const r = shouldAutoRefund({ receipt: 'r1', razorpay_payment_id: 'pay_live123', amount_paise: 100 });
    assert.equal(r.attempt, false);
  });
});

test('live keys + real payment -> attempt', () => {
  withKeys('rzp_live_abc', 'real_secret', () => {
    const r = shouldAutoRefund({ receipt: 'r1', razorpay_payment_id: 'pay_live123', amount_paise: 549500 });
    assert.equal(r.attempt, true);
  });
});
