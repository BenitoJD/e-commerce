const test = require('node:test');
const assert = require('node:assert/strict');
const { releaseCouponUse, RELEASED_FROM } = require('../couponRelease');

function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows };
    },
  };
}

test('cancelling an order gives the coupon use back', async () => {
  const db = fakeDb([{ code: 'SAVE10', used_count: 3 }]);
  const r = await releaseCouponUse(db, 'save10', 'paid');
  assert.equal(r.released, true);
  assert.equal(r.usedCount, 3);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /used_count - 1/);
  assert.match(db.calls[0].sql, /GREATEST/, 'never goes negative');
  assert.equal(db.calls[0].params[0], 'save10');
});

test('a second cancel or refund cannot release the use twice', () => {
  assert.equal(RELEASED_FROM.has('cancelled'), false);
  assert.equal(RELEASED_FROM.has('refunded'), false);
});

test('releaseCouponUse skips when there is no coupon or the status held none', async () => {
  const db = fakeDb([{ code: 'X', used_count: 0 }]);
  assert.equal((await releaseCouponUse(db, '', 'paid')).released, false);
  assert.equal((await releaseCouponUse(db, null, 'paid')).released, false);
  assert.equal(db.calls.length, 0, 'no query is issued without a code');

  const closed = await releaseCouponUse(db, 'SAVE10', 'cancelled');
  assert.equal(closed.released, false);
  assert.equal(db.calls.length, 0, 'a cancelled order no longer holds a use');
});

test('releaseCouponUse does not throw when the coupon is gone or the DB errors', async () => {
  const missing = fakeDb([]);
  const r1 = await releaseCouponUse(missing, 'GONE', 'paid');
  assert.equal(r1.released, false);
  assert.match(r1.reason, /no longer exists/);

  const broken = { query: async () => { throw new Error('db down'); } };
  const r2 = await releaseCouponUse(broken, 'SAVE10', 'paid');
  assert.equal(r2.released, false);
  assert.match(r2.reason, /db down/);
});
