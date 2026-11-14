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

// Placeholder values shipped in .env.example / docker-compose must never count as
// configured: they take the "live" path, then the Razorpay client refuses and checkout
// silently creates a mock order that can never be paid.
const PLACEHOLDER_RE = /(placeholder|xxxx|change[-_]?me|your[-_]?key|rzp_test_xxxx)/i;

function isPlaceholder(value) {
  return PLACEHOLDER_RE.test(String(value || ''));
}

function paymentsConfigured(env = process.env) {
  const id = env.RAZORPAY_KEY_ID || '';
  const secret = env.RAZORPAY_KEY_SECRET || '';
  return Boolean(id && secret && !isPlaceholder(id) && !isPlaceholder(secret));
}

// What the checkout should do for an online payment, decided before touching stock.
//   'live' , keys present, create a real Razorpay order
//   'mock' , development without keys (explicitly allowed)
//   'error', production without keys: refuse with a clear message instead of pretending
function onlinePaymentMode(env = process.env) {
  if (paymentsConfigured(env)) return 'live';
  return mockPaymentsAllowed(env) ? 'mock' : 'error';
}

function isMockId(id) {
  return String(id || '').startsWith(MOCK_ID_PREFIX);
}

module.exports = { mockPaymentsAllowed, paymentsConfigured, onlinePaymentMode, isMockId, MOCK_ID_PREFIX, isPlaceholder };
