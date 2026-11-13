const test = require('node:test');
const assert = require('node:assert/strict');
const { isStaleHold, pickStaleHolds, DEFAULT_MINUTES } = require('../staleHolds');

const NOW = new Date('2026-05-20T12:00:00.000Z');
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60 * 1000).toISOString();

test('only pending orders past the window are stale holds', () => {
  assert.equal(isStaleHold({ status: 'pending', created_at: minutesAgo(31) }, { now: NOW }), true);
  assert.equal(isStaleHold({ status: 'pending', created_at: minutesAgo(29) }, { now: NOW }), false);
  assert.equal(isStaleHold({ status: 'pending', created_at: minutesAgo(30) }, { now: NOW }), true, 'boundary is inclusive');
  assert.equal(isStaleHold({ status: 'paid', created_at: minutesAgo(600) }, { now: NOW }), false, 'paid orders hold stock legitimately');
  assert.equal(isStaleHold({ status: 'cancelled', created_at: minutesAgo(600) }, { now: NOW }), false);
});

test('the window is configurable', () => {
  const order = { status: 'pending', created_at: minutesAgo(45) };
  assert.equal(isStaleHold(order, { now: NOW, minutes: 30 }), true);
  assert.equal(isStaleHold(order, { now: NOW, minutes: 60 }), false);
  assert.equal(DEFAULT_MINUTES, 30);
});

test('unknown timestamps are left alone rather than guessed', () => {
  assert.equal(isStaleHold({ status: 'pending' }, { now: NOW }), false);
  assert.equal(isStaleHold({ status: 'pending', created_at: 'not-a-date' }, { now: NOW }), false);
  assert.equal(isStaleHold(null, { now: NOW }), false);
});

test('pickStaleHolds filters a mixed list', () => {
  const rows = [
    { id: 1, status: 'pending', created_at: minutesAgo(90) },
    { id: 2, status: 'pending', created_at: minutesAgo(1) },
    { id: 3, status: 'paid', created_at: minutesAgo(90) },
  ];
  assert.deepEqual(pickStaleHolds(rows, { now: NOW }).map((o) => o.id), [1]);
  assert.deepEqual(pickStaleHolds(null, { now: NOW }), []);
});
