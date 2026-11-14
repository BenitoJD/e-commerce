// Boot-time configuration audit for production.
//
// Each individual policy (CORS, webhooks, payments) already decides correctly at request
// time, but an operator only discovers a misconfiguration when a shopper hits it. This
// collects the loud warnings in one place so the startup log states, plainly, which
// production features are degraded.
const { corsWarning } = require('./security');
const { webhookWarning } = require('./webhookAuth');
const { paymentsConfigured, mockPaymentsAllowed } = require('./payments');
const { smsConfigured } = require('./sms');

const MIN_ADMIN_TOKEN = 16;
const DEFAULT_ADMIN_TOKENS = new Set(['change-me-long-random-string', 'changeme', 'please-change-me', 'admin', 'admin123', 'toolsvilla']);

function configWarnings(env = process.env) {
  const production = String(env.NODE_ENV || '') === 'production';
  if (!production) return [];

  const warnings = [];

  const token = String(env.ADMIN_TOKEN || '');
  if (!token) {
    warnings.push('[config] ADMIN_TOKEN is not set, the admin console is disabled (all /admin routes return 503).');
  } else if (token.length < MIN_ADMIN_TOKEN) {
    warnings.push(`[config] ADMIN_TOKEN is shorter than ${MIN_ADMIN_TOKEN} characters, use a long random value; the admin API is reachable from the internet.`);
  } else if (DEFAULT_ADMIN_TOKENS.has(token.toLowerCase())) {
    warnings.push('[config] ADMIN_TOKEN still uses a well-known default, change it before exposing the admin console.');
  }

  if (!paymentsConfigured(env)) {
    warnings.push(mockPaymentsAllowed(env)
      ? '[config] Razorpay keys are not set, online checkout returns mock orders (ALLOW_MOCK_PAYMENTS=true). Switch this off before taking real orders.'
      : '[config] Razorpay keys are not set, online checkout will REFUSE orders (503) until they are configured.');
  }

  const cors = corsWarning(env);
  if (cors) warnings.push(cors);

  const webhook = webhookWarning(env);
  if (webhook) warnings.push(webhook);

  if (!env.AUTH_SECRET) {
    warnings.push('[config] AUTH_SECRET is not set, session and OTP tokens fall back to a development secret. Set a long random value.');
  }
  if (!(env.SMTP_HOST && env.SMTP_FROM)) {
    warnings.push('[config] SMTP is not configured, order emails are recorded in the admin outbox but not delivered.');
  }
  if (!smsConfigured(env)) {
    warnings.push('[config] No SMS provider is configured, guest OTP order lookup is unavailable; customers should create an account.');
  }

  return warnings;
}

module.exports = { configWarnings, MIN_ADMIN_TOKEN };
