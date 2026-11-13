// Order status transitions, extracted from the admin router so that the console, the bulk
// action and the background stale-hold sweep all share one implementation. Guards, stock
// release, refunds and coupon release must never diverge between those callers.
const { canTransition, shouldReleaseOnCancel } = require('./orderTransitions');
const { releaseItems } = require('./stock');
const { refundPayment } = require('./refunds');
const { releaseCouponUse } = require('./couponRelease');
const { notifyOrder } = require('./notify');

async function transitionOrder(db, id, status) {
  const { rows: current } = await db.query(
    'SELECT receipt, status, items, amount_paise, razorpay_payment_id, coupon_code, pay_mode, customer, customer_email, refunded_paise FROM orders WHERE id = $1',
    [id]
  );
  if (!current.length) return { ok: false, code: 404, error: 'Order not found' };
  const order = current[0];
  const guard = canTransition(order.status, status);
  if (!guard.ok) return { ok: false, code: 409, error: guard.reason };

  const { rows } = await db.query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
  // Record when the parcel actually reached the customer: the return window runs from here.
  if (status === 'delivered') {
    await db.query('UPDATE orders SET delivered_at = COALESCE(delivered_at, NOW()) WHERE id = $1', [id]);
  }

  if ((status === 'cancelled' || status === 'refunded') && shouldReleaseOnCancel(order.status)) {
    await releaseItems(db, Array.isArray(order.items) ? order.items : []);
  }
  if (status === 'cancelled' || status === 'refunded') {
    await releaseCouponUse(db, order.coupon_code, order.status);
  }

  // Refunds are due for any prepaid order, not only one still in `paid`. A shipped or
  // delivered order used to be marked refunded with no money moved and no refund_mode,
  // which hid it from the manual-refund queue.
  let refund = { mode: 'none' };
  const prepaid = order.pay_mode !== 'cod' && Boolean(order.razorpay_payment_id);
  const needsRefund = status === 'refunded' || (status === 'cancelled' && prepaid);
  if (needsRefund) {
    if (prepaid) {
      refund = await refundPayment(order);
    } else {
      // No money was captured online. A cancelled COD order needs no refund; a refunded
      // delivered COD order needs a cash refund, so flag it for the operator.
      refund = { mode: status === 'refunded' && order.pay_mode === 'cod' ? 'manual' : 'none', reason: 'no captured online payment' };
    }
    if (refund.mode !== 'none') {
      await db.query(
        "UPDATE orders SET refund_mode = $1, refunded_at = NOW(), refunded_paise = CASE WHEN $2 = 'refunded' THEN amount_paise ELSE refunded_paise END WHERE id = $3",
        [refund.mode, status, id]
      );
    } else if (status === 'refunded') {
      await db.query('UPDATE orders SET refunded_paise = amount_paise WHERE id = $1', [id]);
    }
  }

  if (['shipped', 'delivered', 'cancelled', 'refunded'].includes(status)) {
    try {
      await notifyOrder(db, { ...order, status }, status);
    } catch (err) {
      console.error('[orders] notification failed:', err.message);
    }
  }

  console.log(`[orders] ${rows[0].receipt} ${order.status} -> ${status} refund=${refund.mode}`);
  return { ok: true, order: rows[0], refund: refund.mode };
}

module.exports = { transitionOrder };
