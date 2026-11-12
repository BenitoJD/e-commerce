// Pure order state-machine + webhook helpers (zero dependencies except node:crypto).
// Covered by src/lib/__tests__/orderTransitions.test.js
const crypto = require('crypto');

// Statuses that still hold reserved stock (i.e. cancelling/failing must release it)
const STOCK_HOLDING = ['pending', 'paid', 'cod_pending'];

function verifySignature(rawBuffer, signatureHex, secret) {
  if (!secret) return false;
  const sig = String(signatureHex || '');
  if (!/^[0-9a-fA-F]+$/.test(sig) || sig.length === 0) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBuffer).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig.toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function amountMatches(orderPaise, entityPaise) {
  return Number(orderPaise) === Number(entityPaise);
}

// Decide the outcome of a Razorpay event given the current order status.
// Returns { to: <newStatus|null>, release: <bool>, reason } — null `to` means ack, no change.
function decideTransition(currentStatus, event, amountsEqual) {
  const from = String(currentStatus || '');
  if (event === 'payment.captured') {
    if (!['pending', 'failed'].includes(from)) {
      return { to: null, release: false, reason: `already ${from}, ignoring late capture` };
    }
    if (!amountsEqual) {
      return { to: null, release: false, reason: 'amount mismatch, held for manual review' };
    }
    return { to: 'paid', release: false, reason: '' };
  }
  if (event === 'payment.failed') {
    if (from !== 'pending') {
      return { to: null, release: false, reason: `already ${from}, ignoring failure` };
    }
    return { to: 'failed', release: true, reason: '' };
  }
  if (event === 'refund.processed' || event === 'refund.created') {
    if (['refunded', 'cancelled'].includes(from)) {
      return { to: null, release: false, reason: `already ${from}` };
    }
    // Stock returns to shelf only if it was still held; shipped/delivered goods need QC.
    const release = STOCK_HOLDING.includes(from);
    return { to: 'refunded', release, reason: '' };
  }
  return { to: null, release: false, reason: 'unhandled event' };
}

// Admin/customer cancellation: should stock be released given the previous status?
function shouldReleaseOnCancel(fromStatus) {
  return STOCK_HOLDING.includes(String(fromStatus || ''));
}

// Admin/customer status changes allowed from each state (terminal states locked).
const ALLOWED_TARGETS = {
  pending: ['paid', 'shipped', 'cod_pending', 'cancelled', 'failed'],
  paid: ['shipped', 'cancelled', 'refunded'],
  cod_pending: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled', 'refunded'],
  delivered: ['refunded', 'cancelled'],
  cancelled: [],
  refunded: [],
  failed: ['pending', 'cancelled'],
};

// Returns { ok:true } or { ok:false, reason }. Unknown statuses pass through (forward-compat).
function canTransition(fromStatus, toStatus) {
  const from = String(fromStatus || '');
  const to = String(toStatus || '');
  if (from === to) return { ok: true };
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_TARGETS, from)) return { ok: true };
  if (ALLOWED_TARGETS[from].includes(to)) return { ok: true };
  return { ok: false, reason: `Cannot move order from '${from}' to '${to}'` };
}

module.exports = { verifySignature, amountMatches, decideTransition, shouldReleaseOnCancel, canTransition, STOCK_HOLDING };
