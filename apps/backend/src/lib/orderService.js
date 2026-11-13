// Order status transitions, extracted from the admin router so that the console, the bulk
// action and the background stale-hold sweep all share one implementation. Guards, stock
// release, refunds and coupon release must never diverge between those callers.
const { canTransition, shouldReleaseOnCancel } = require('./orderTransitions');
const { releaseItems } = require('./stock');
const { refundPayment } = require('./refunds');
const { releaseCouponUse } = require('./couponRelease');

async function transitionOrder(db, id, status) {
  const { rows: current } = await db.query(
    'SELECT receipt, status, items, amount_paise, razorpay_payment_id, coupon_code FROM orders WHERE id = $1',
    [id]
  );
  if (!current.length) return { ok: false, code: 404, error: 'Order not found' };
  const guard = canTransition(current[0].status, status);
  if (!guard.ok) return { ok: false, code: 409, error: guard.reason };

  const { rows } = await db.query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
  // Record when the parcel actually reached the customer: the return window runs from here.
  if (status === 'delivered') {
    await db.query('UPDATE orders SET delivered_at = COALESCE(delivered_at, NOW()) WHERE id = $1', [id]);
  }

  if ((status === 'cancelled' || status === 'refunded') && shouldReleaseOnCancel(current[0].status)) {
    await releaseItems(db, Array.isArray(current[0].items) ? current[0].items : []);
  }
  if (status === 'cancelled' || status === 'refunded') {
    await releaseCouponUse(db, current[0].coupon_code, current[0].status);
  }

  let refund = { mode: 'none' };
  if ((status === 'cancelled' || status === 'refunded') && current[0].status === 'paid') {
    refund = await refundPayment({ ...current[0], receipt: current[0].receipt });
    await db.query('UPDATE orders SET refund_mode = $1, refunded_at = NOW() WHERE id = $2', [refund.mode, id]);
    rows[0].refund_mode = refund.mode;
  }
  console.log(`[orders] ${rows[0].receipt} ${current[0].status} -> ${status} refund=${refund.mode}`);
  return { ok: true, order: rows[0], refund: refund.mode };
}

module.exports = { transitionOrder };
