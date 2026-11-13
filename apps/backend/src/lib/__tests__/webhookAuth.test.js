const test = require('node:test');
const assert = require('node:assert/strict');
const { webhookMode, webhookWarning } = require('../webhookAuth');

const STRONG = { RAZORPAY_WEBHOOK_SECRET: 'whsec_9f8e7d6c5b4a' };

test('production without a usable secret fails closed', () => {
  assert.equal(webhookMode({ NODE_ENV: 'production' }), 'error');
  assert.equal(webhookMode({ NODE_ENV: 'production', RAZORPAY_WEBHOOK_SECRET: '' }), 'error');
  assert.equal(webhookMode({ NODE_ENV: 'production', RAZORPAY_WEBHOOK_SECRET: '   ' }), 'error');
  // Placeholders must not be mistaken for a real secret.
  for (const fake of ['placeholder', 'your-placeholder-secret', 'changeme', 'xxxxxxxx']) {
    assert.equal(webhookMode({ NODE_ENV: 'production', RAZORPAY_WEBHOOK_SECRET: fake }), 'error', fake);
  }
});

test('a real secret verifies in every environment', () => {
  assert.equal(webhookMode({ NODE_ENV: 'production', ...STRONG }), 'verify');
  assert.equal(webhookMode(STRONG), 'verify');
  assert.equal(webhookMode({ NODE_ENV: 'production', RAZORPAY_WEBHOOK_SECRET: 'PLACEHOLDER' }), 'error',
    'case-insensitive placeholder detection');
});

test('development keeps the unsigned convenience', () => {
  assert.equal(webhookMode({}), 'skip');
  assert.equal(webhookMode({ NODE_ENV: 'development' }), 'skip');
  assert.equal(webhookMode({ NODE_ENV: 'test' }), 'skip');
});

test('only the production misconfiguration warns', () => {
  assert.match(webhookWarning({ NODE_ENV: 'production' }), /REJECTED in production/);
  assert.equal(webhookWarning({ NODE_ENV: 'production', ...STRONG }), null);
  assert.equal(webhookWarning({}), null);
});
