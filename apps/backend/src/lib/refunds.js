// Razorpay refund helper: decides + executes refunds for cancelled/failed-charge flows.
// The SDK is required lazily inside execution so decision logic stays dependency-free
// (and unit-testable without network or installed gateway packages).
function keysConfigured() {
  const id = process.env.RAZORPAY_KEY_ID || '';
  const secret = process.env.RAZORPAY_KEY_SECRET || '';
  // Never touch the gateway with placeholder/demo credentials.
  const bad = /(placeholder|xxxx)/i;
  return Boolean(id && secret && !bad.test(id) && !bad.test(secret));
}

// Pure: should we attempt an automatic gateway refund for this order?
function shouldAutoRefund(order) {
  const o = order || {};
  if (!o.razorpay_payment_id) return { attempt: false, reason: 'no captured payment' };
  if (String(o.razorpay_payment_id).startsWith('order_mock_') || String(o.razorpay_payment_id).startsWith('mock')) {
    return { attempt: false, reason: 'mock payment' };
  }
  if (!keysConfigured()) return { attempt: false, reason: 'gateway keys not configured' };
  return { attempt: true, reason: '' };
}

async function refundPayment(order) {
  const decision = shouldAutoRefund(order);
  if (!decision.attempt) return { ok: false, mode: 'manual', reason: decision.reason };
  try {
    const Razorpay = require('razorpay');
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const refund = await rzp.payments.refund(order.razorpay_payment_id, {
      amount: Number(order.amount_paise) || undefined,
      speed: 'normal',
    });
    console.log(`[refund] auto-refunded ${order.receipt} -> ${refund && refund.id}`);
    return { ok: true, mode: 'auto', id: (refund && refund.id) || null };
  } catch (err) {
    // e.g. already refunded in dashboard — leave order marked cancelled/refunded, flag manual review.
    console.error(`[refund] auto-refund failed for ${order.receipt}:`, err && err.message);
    return { ok: false, mode: 'manual', reason: (err && err.message) || 'gateway error' };
  }
}

module.exports = { keysConfigured, shouldAutoRefund, refundPayment };
