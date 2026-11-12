const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeRecentOrders } = require('../stats');

const NOW = new Date('2026-05-20T12:00:00.000Z');

function row(created_at, status, amount_paise, refund_mode = null) {
  return { created_at, status, amount_paise, refund_mode };
}

test('summarizeRecentOrders counts today and the trailing week', () => {
  const rows = [
    row('2026-05-20T01:00:00.000Z', 'paid', 100000),
    row('2026-05-20T09:30:00.000Z', 'delivered', 50000),
    row('2026-05-20T10:00:00.000Z', 'pending', 70000), // not revenue
    row('2026-05-19T23:59:00.000Z', 'paid', 25000), // yesterday, in week
    row('2026-05-15T10:00:00.000Z', 'shipped', 40000), // 5 days ago, in week
    row('2026-05-13T10:00:00.000Z', 'paid', 999999), // 7 days ago, outside
  ];
  const s = summarizeRecentOrders(rows, NOW);
  assert.equal(s.ordersToday, 3);
  assert.equal(s.revenueTodayPaise, 150000); // paid + delivered only
  assert.equal(s.revenue7dPaise, 150000 + 25000 + 40000);
  assert.equal(s.pendingOrders, 1);
});

test('summarizeRecentOrders counts manual refunds needing action', () => {
  const s = summarizeRecentOrders([
    row('2026-05-20T02:00:00.000Z', 'cancelled', 100000, 'manual'),
    row('2026-05-20T03:00:00.000Z', 'cancelled', 100000, 'auto'),
    row('2026-05-20T04:00:00.000Z', 'cod_pending', 30000),
  ], NOW);
  assert.equal(s.manualRefunds, 1);
  assert.equal(s.pendingOrders, 1);
  assert.equal(s.revenueTodayPaise, 0, 'cancelled orders never count as revenue');
});

test('summarizeRecentOrders tolerates junk rows and empty input', () => {
  const s = summarizeRecentOrders([
    null,
    {},
    { created_at: 'not-a-date', status: 'paid', amount_paise: 500 },
    { created_at: '2026-05-20T05:00:00.000Z', status: 'paid' }, // missing amount
  ], NOW);
  assert.equal(s.ordersToday, 1);
  assert.equal(s.revenueTodayPaise, 0);
  assert.deepEqual(summarizeRecentOrders(null, NOW), {
    ordersToday: 0, revenueTodayPaise: 0, revenue7dPaise: 0, pendingOrders: 0, manualRefunds: 0,
  });
});
