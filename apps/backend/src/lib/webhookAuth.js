// Webhook authentication policy.
//
// The route used to skip signature verification whenever RAZORPAY_WEBHOOK_SECRET was unset
// or looked like a placeholder. In production that let ANYONE POST a fake `payment.captured`
// event to /webhooks/razorpay and mark an order paid, free goods. Development keeps the
// convenience; production must fail closed.
function webhookMode(env = process.env) {
  const secret = String(env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  const usable = secret.length > 0 && !/placeholder|changeme|xxxx/i.test(secret);
  if (usable) return 'verify';
  return String(env.NODE_ENV || '') === 'production' ? 'error' : 'skip';
}

function webhookWarning(env = process.env) {
  if (webhookMode(env) !== 'error') return null;
  return '[webhook] RAZORPAY_WEBHOOK_SECRET is missing or a placeholder, payment webhooks '
    + 'will be REJECTED in production. Set the secret from the Razorpay dashboard.';
}

module.exports = { webhookMode, webhookWarning };
