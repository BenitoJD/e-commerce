// Payment-gateway availability policy.
//
// Checkout used to fall back to a fake `order_mock_…` id whenever Razorpay keys were missing
// OR the Razorpay API errored. In development that is convenient; in production it hands the
// shopper a payment sheet that cannot work, while the order sits pending and holds stock.
const MOCK_ID_PREFIX = 'order_mock_';

function mockPaymentsAllowed(env = process.env) {
  if (String(env.ALLOW_MOCK_PAYMENTS || '').toLowerCase() === 'true') return true;
  return String(env.NODE_ENV || '') !== 'production';
}

function paymentsConfigured(env = process.env) {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

// What the checkout should do for an online payment, decided before touching stock.
//   'live'  — keys present, create a real Razorpay order
//   'mock'  — development without keys (explicitly allowed)
//   'error' — production without keys: refuse with a clear message instead of pretending
function onlinePaymentMode(env = process.env) {
  if (paymentsConfigured(env)) return 'live';
  return mockPaymentsAllowed(env) ? 'mock' : 'error';
}

function isMockId(id) {
  return String(id || '').startsWith(MOCK_ID_PREFIX);
}

module.exports = { mockPaymentsAllowed, paymentsConfigured, onlinePaymentMode, isMockId, MOCK_ID_PREFIX };
