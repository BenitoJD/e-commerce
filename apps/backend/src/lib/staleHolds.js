// Stale stock holds.
//
// Checkout reserves stock when the order is created. If the customer abandons the payment
// sheet, no webhook ever arrives, so the order stays 'pending', and its stock stays reserved
// forever. A handful of abandoned checkouts can zero out a product that is physically on the
// shelf. These helpers decide which holds are old enough to release.
const DEFAULT_MINUTES = 30;
const DAY_MINUTES = 24 * 60;

function isStaleHold(order, { now = new Date(), minutes = DEFAULT_MINUTES } = {}) {
  if (!order || String(order.status) !== 'pending') return false;
  const created = order.created_at ?? order.createdAt;
  const when = created ? new Date(created) : null;
  if (!when || Number.isNaN(when.getTime())) return false; // unknown age: leave it alone
  const windowMs = Math.max(1, Number(minutes) || DEFAULT_MINUTES) * 60 * 1000;
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  if (Number.isNaN(nowMs)) return false;
  return nowMs - when.getTime() >= windowMs;
}

function pickStaleHolds(orders, { now = new Date(), minutes = DEFAULT_MINUTES } = {}) {
  const list = Array.isArray(orders) ? orders : [];
  return list.filter((o) => isStaleHold(o, { now, minutes }));
}

module.exports = { isStaleHold, pickStaleHolds, DEFAULT_MINUTES, DAY_MINUTES };
