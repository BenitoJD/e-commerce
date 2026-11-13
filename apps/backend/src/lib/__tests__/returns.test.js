const test = require('node:test');
const assert = require('node:assert/strict');
const { returnWindow, WINDOW_DAYS } = require('../returns');

const NOW = new Date('2026-05-20T12:00:00.000Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

test('a delivery inside the window is returnable', () => {
  const w = returnWindow({ deliveredAt: daysAgo(3), now: NOW });
  assert.equal(w.allowed, true);
  assert.equal(w.anchoredOn, 'delivery');
  assert.equal(w.daysLeft, WINDOW_DAYS - 3);
});

test('the window closes after 7 days from delivery', () => {
  assert.equal(returnWindow({ deliveredAt: daysAgo(6), now: NOW }).allowed, true, 'day 6 is inside');
  assert.equal(returnWindow({ deliveredAt: daysAgo(7), now: NOW }).allowed, true, 'day 7 is still inside (inclusive)');
  assert.equal(returnWindow({ deliveredAt: daysAgo(8), now: NOW }).allowed, false, 'day 8 is late');
  assert.ok(returnWindow({ deliveredAt: daysAgo(30), now: NOW }).daysLeft < 0);
});

test('without a delivery timestamp the order date is used as a fallback', () => {
  const w = returnWindow({ createdAt: daysAgo(2), now: NOW });
  assert.equal(w.allowed, true);
  assert.equal(w.anchoredOn, 'order');
});

test('missing timestamps do not invent a refusal', () => {
  const w = returnWindow({ now: NOW });
  assert.equal(w.allowed, true);
  assert.equal(w.deadline, null);
  assert.equal(w.anchoredOn, 'none');
});

test('junk timestamps are treated as missing, not as ancient orders', () => {
  const w = returnWindow({ deliveredAt: 'not-a-date', now: NOW });
  assert.equal(w.allowed, true);
  assert.equal(w.anchoredOn, 'none');
});
