// Boot-time configuration audit for production.
//
// Each individual policy (CORS, webhooks, payments) already decides correctly at request
// time, but an operator only discovers a misconfiguration when a shopper hits it. This
// collects the loud warnings in one place so the startup log states, plainly, which
// production features are degraded.
const { corsWarning } = require('./security');
const { webhookWarning } = require('./webhookAuth');
const { paymentsConfigured, mockPaymentsAllowed } = require('./payments');

const MIN_ADMIN_TOKEN = 16;

function configWarnings(env = process.env) {
  const production = String(env.NODE_ENV || '') === 'production';
  if (!production) return [];

  const warnings = [];

  const token = String(env.ADMIN_TOKEN || '');
  if (!token) {
    warnings.push('[config] ADMIN_TOKEN is not set — the admin console is disabled (all /admin routes return 503).');
  } else if (token.length < MIN_ADMIN_TOKEN) {
    warnings.push(`[config] ADMIN_TOKEN is shorter than ${MIN_ADMIN_TOKEN} characters — use a long random value; the admin API is reachable from the internet.`);
  }

  if (!paymentsConfigured(env)) {
    warnings.push(mockPaymentsAllowed(env)
      ? '[config] Razorpay keys are not set — online checkout returns mock orders (ALLOW_MOCK_PAYMENTS=true). Switch this off before taking real orders.'
      : '[config] Razorpay keys are not set — online checkout will REFUSE orders (503) until they are configured.');
  }

  const cors = corsWarning(env);
  if (cors) warnings.push(cors);

  const webhook = webhookWarning(env);
  if (webhook) warnings.push(webhook);

  return warnings;
}

module.exports = { configWarnings, MIN_ADMIN_TOKEN };
