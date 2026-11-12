const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrderFilter, parseDate } = require('../adminFilters');

test('buildOrderFilter: no filters means no WHERE clause', () => {
  const f = buildOrderFilter({});
  assert.equal(f.where, '');
  assert.deepEqual(f.params, []);
  assert.deepEqual(f.ignored, { from: false, to: false, status: false });
});

test('buildOrderFilter numbers placeholders in order (status, from, to, q)', () => {
  const f = buildOrderFilter({ status: 'paid', from: '2026-01-01', to: '2026-01-31', q: 'rcpt_abc' });
  assert.equal(
    f.where,
    'WHERE status = $1 AND created_at >= $2 AND created_at <= $3 AND (receipt ILIKE $4 OR customer->>\'phone\' ILIKE $4 OR customer->>\'name\' ILIKE $4)'
  );
  assert.equal(f.params.length, 4);
  assert.equal(f.params[0], 'paid');
  assert.equal(f.params[1], '2026-01-01T00:00:00.000Z');
  assert.equal(f.params[2], '2026-01-31T23:59:59.999Z'); // inclusive end of day
  assert.equal(f.params[3], '%rcpt_abc%');
});

test('buildOrderFilter ignores invalid values instead of throwing', () => {
  const f = buildOrderFilter({ status: 'nonsense', from: '31-01-2026', to: '2026-13-45', q: '   ' });
  assert.equal(f.where, '');
  assert.deepEqual(f.params, []);
  assert.deepEqual(f.ignored, { from: true, to: true, status: true });
});

test('buildOrderFilter: single date bounds work independently', () => {
  const fromOnly = buildOrderFilter({ from: '2026-02-01' });
  assert.equal(fromOnly.where, 'WHERE created_at >= $1');
  const toOnly = buildOrderFilter({ to: '2026-02-28' });
  assert.equal(toOnly.where, 'WHERE created_at <= $1');
});

test('parseDate validates the shape and day boundaries', () => {
  assert.equal(parseDate('2026-01-01'), '2026-01-01T00:00:00.000Z');
  assert.equal(parseDate('2026-01-01', true), '2026-01-01T23:59:59.999Z');
  for (const bad of ['', null, '2026/01/01', '01-01-2026', 'today', '2026-1-1']) {
    assert.equal(parseDate(bad), null, `expected null for ${String(bad)}`);
  }
});
