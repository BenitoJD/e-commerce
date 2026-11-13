const test = require('node:test');
const assert = require('node:assert/strict');
const { sweepIntervalMinutes, sweepStaleHolds } = require('../sweep');

test('sweepIntervalMinutes defaults, parses and disables', () => {
  assert.equal(sweepIntervalMinutes(undefined), 15, 'default cadence');
  assert.equal(sweepIntervalMinutes(''), 15, 'empty means default');
  assert.equal(sweepIntervalMinutes('5'), 5);
  assert.equal(sweepIntervalMinutes('0'), 0, '0 disables the sweep');
  assert.equal(sweepIntervalMinutes('30'), 30);
  assert.equal(sweepIntervalMinutes('abc'), 15, 'junk falls back');
  assert.equal(sweepIntervalMinutes('-5'), 15, 'negative falls back');
  assert.equal(sweepIntervalMinutes('99999'), 1440, 'capped at a day');
});

test('sweepStaleHolds cancels stale pendings and reports skips', async () => {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/WHERE status = 'pending'/.test(sql)) {
        return { rows: [{ id: 1, receipt: 'rcpt_old', status: 'pending' }, { id: 2, receipt: 'rcpt_bad', status: 'pending' }] };
      }
      if (/SELECT receipt, status, items/.test(sql)) {
        // Order 1 transitions fine; order 2 has no row (deleted mid-run).
        return { rows: params[0] === 1 ? [{ receipt: 'rcpt_old', status: 'pending', items: [], coupon_code: null }] : [] };
      }
      if (/UPDATE orders SET status/.test(sql)) return { rows: [{ receipt: 'rcpt_old', status: 'cancelled' }] };
      return { rows: [] };
    },
  };
  const result = await sweepStaleHolds(db, { minutes: 30 });
  assert.equal(result.released.length, 1);
  assert.equal(result.released[0].receipt, 'rcpt_old');
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].id, 2);
  assert.match(result.skipped[0].reason, /not found/i);
  assert.equal(calls[0].params[0], 30, 'the window reaches SQL');
});
