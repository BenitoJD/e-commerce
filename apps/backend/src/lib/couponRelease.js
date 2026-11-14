// Give a coupon use back when an order is cancelled or refunded.
//
// Checkout increments coupons.used_count when a coupon is applied. Cancelling the order must
// give that use back, otherwise a limited coupon is silently consumed by orders that never
// completed, and a customer who cancels cannot reuse their own code.
//
// The caller passes the order's *previous* status so a re-cancel (or cancel-then-refund)
// cannot decrement twice.
const RELEASED_FROM = new Set(['pending', 'paid', 'cod_pending', 'shipped', 'delivered']);

async function releaseCouponUse(db, code, previousStatus) {
  const couponCode = String(code || '').trim();
  if (!couponCode) return { released: false, reason: 'no coupon' };
  if (!RELEASED_FROM.has(String(previousStatus || '').toLowerCase())) {
    return { released: false, reason: `previous status '${previousStatus}' does not hold a coupon use` };
  }
  try {
    const { rows } = await db.query(
      `UPDATE coupons SET used_count = GREATEST(used_count - 1, 0)
        WHERE UPPER(code) = UPPER($1)
        RETURNING code, used_count`,
      [couponCode]
    );
    if (!rows.length) return { released: false, reason: 'coupon no longer exists' };
    console.log(`[coupons] released a use of ${rows[0].code} (now ${rows[0].used_count})`);
    return { released: true, code: rows[0].code, usedCount: rows[0].used_count };
  } catch (e) {
    // Never block a cancellation because the coupon row misbehaved.
    console.error('[coupons] release error:', e.message);
    return { released: false, reason: e.message };
  }
}

module.exports = { releaseCouponUse, RELEASED_FROM };
