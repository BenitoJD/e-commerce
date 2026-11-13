const test = require('node:test');
const assert = require('node:assert/strict');
const { onlinePaymentMode, mockPaymentsAllowed, paymentsConfigured, isMockId } = require('../payments');

const KEYS = { RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 'secret' };

test('production without keys refuses online payment instead of faking one', () => {
  assert.equal(onlinePaymentMode({ NODE_ENV: 'production' }), 'error');
  assert.equal(onlinePaymentMode({ NODE_ENV: 'production', RAZORPAY_KEY_ID: 'rzp_live_x' }), 'error',
    'a key id without the secret is still unconfigured');
  assert.equal(mockPaymentsAllowed({ NODE_ENV: 'production' }), false);
});

test('configured production creates real orders', () => {
  assert.equal(onlinePaymentMode({ NODE_ENV: 'production', ...KEYS }), 'live');
  assert.equal(paymentsConfigured(KEYS), true);
});

test('development keeps the mock convenience', () => {
  assert.equal(onlinePaymentMode({}), 'mock');
  assert.equal(onlinePaymentMode({ NODE_ENV: 'development' }), 'mock');
  assert.equal(onlinePaymentMode({ NODE_ENV: 'test' }), 'mock');
});

test('staging can opt in explicitly', () => {
  assert.equal(onlinePaymentMode({ NODE_ENV: 'production', ALLOW_MOCK_PAYMENTS: 'true' }), 'mock');
  assert.equal(onlinePaymentMode({ NODE_ENV: 'production', ALLOW_MOCK_PAYMENTS: 'TRUE' }), 'mock');
  assert.equal(onlinePaymentMode({ NODE_ENV: 'production', ALLOW_MOCK_PAYMENTS: 'false' }), 'error');
});

test('mock ids are recognisable', () => {
  assert.equal(isMockId('order_mock_123'), true);
  assert.equal(isMockId('order_MZx9'), false);
  assert.equal(isMockId(null), false);
});
