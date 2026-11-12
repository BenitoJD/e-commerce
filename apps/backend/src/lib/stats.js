// Time-window summaries for the admin dashboard.
//
// Kept pure: the SQL only fetches the last few days of orders, and this function turns
// them into the numbers an owner actually opens the console for (today's takings,
// the week's trend, and anything waiting on a human).
function toDate(value) {
  // new Date(null) is the 1970 epoch, not "invalid" — guard the empty cases explicitly.
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(d) {
  return d.toISOString().slice(0, 10);
}

function summarizeRecentOrders(rows, now = new Date()) {
  const today = dayKey(now);
  const weekAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const weekAgoKey = dayKey(weekAgo);

  // Revenue counts money we actually keep: paid/delivered, minus cancelled/refunded.
  const revenueStates = new Set(['paid', 'delivered', 'shipped']);
  const result = {
    ordersToday: 0,
    revenueTodayPaise: 0,
    revenue7dPaise: 0,
    pendingOrders: 0,
    manualRefunds: 0,
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const created = toDate(row.created_at);
    if (!created) continue;
    const key = dayKey(created);
    const amount = Number(row.amount_paise) || 0;
    const status = String((row && row.status) || '');
    const isRevenue = revenueStates.has(status);

    if (key === today) {
      result.ordersToday += 1;
      if (isRevenue) result.revenueTodayPaise += amount;
    }
    if (key >= weekAgoKey && key <= today && isRevenue) {
      result.revenue7dPaise += amount;
    }
    if (status === 'pending' || status === 'cod_pending') result.pendingOrders += 1;
    if (String((row && row.refund_mode) || '') === 'manual') result.manualRefunds += 1;
  }

  return result;
}

module.exports = { summarizeRecentOrders, dayKey };
