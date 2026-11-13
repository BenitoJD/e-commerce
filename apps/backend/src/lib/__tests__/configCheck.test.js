const test = require('node:test');
const assert = require('node:assert/strict');
const { configWarnings, MIN_ADMIN_TOKEN } = require('../configCheck');

const GOOD = {
  NODE_ENV: 'production',
  ADMIN_TOKEN: 'a'.repeat(MIN_ADMIN_TOKEN),
  RAZORPAY_KEY_ID: 'rzp_live_x',
  RAZORPAY_KEY_SECRET: 'secret',
  RAZORPAY_WEBHOOK_SECRET: 'whsec_realsecret',
  FRONTEND_URL: 'https://shop.test',
};

test('a correctly configured production deploy warns about nothing', () => {
  assert.deepEqual(configWarnings(GOOD), []);
});

test('development never nags', () => {
  assert.deepEqual(configWarnings({ NODE_ENV: 'development' }), []);
  assert.deepEqual(configWarnings({}), []);
});

test('missing or weak admin token is called out', () => {
  const missing = configWarnings({ ...GOOD, ADMIN_TOKEN: '' });
  assert.equal(missing.length, 1);
  assert.match(missing[0], /admin console is disabled/);

  const weak = configWarnings({ ...GOOD, ADMIN_TOKEN: 'short' });
  assert.equal(weak.length, 1);
  assert.match(weak[0], new RegExp(`shorter than ${MIN_ADMIN_TOKEN}`));
});

test('an unconfigured payment gateway is called out, distinctly for mock mode', () => {
  const refused = configWarnings({ ...GOOD, RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' });
  assert.ok(refused.some((w) => /online checkout will REFUSE/.test(w)));

  const mocked = configWarnings({ ...GOOD, RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', ALLOW_MOCK_PAYMENTS: 'true' });
  assert.ok(mocked.some((w) => /mock orders/.test(w)));
});

test('CORS and webhook misconfigurations are included', () => {
  const warnings = configWarnings({ ...GOOD, FRONTEND_URL: '', RAZORPAY_WEBHOOK_SECRET: '' });
  assert.ok(warnings.some((w) => /FRONTEND_URL is not set/.test(w)));
  assert.ok(warnings.some((w) => /REJECTED in production/.test(w)));
  assert.equal(warnings.length, 2);
});

test('every warning is prefixed so it is easy to grep in logs', () => {
  const warnings = configWarnings({ NODE_ENV: 'production' });
  assert.ok(warnings.length >= 3);
  for (const w of warnings) assert.match(w, /^\[(config|security|webhook)\]/);
});
