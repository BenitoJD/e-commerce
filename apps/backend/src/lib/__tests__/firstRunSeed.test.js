const test = require('node:test');
const assert = require('node:assert/strict');
const { seedIfEmpty, seedOnBoot } = require('../firstRunSeed');

function fakeDb(count) {
  const calls = [];
  const state = { count };
  return {
    calls,
    async query(text, params) {
      calls.push({ text, params });
      if (text.includes('COUNT(*)::int AS n FROM products')) return { rows: [{ n: state.count }] };
      if (text.startsWith('INSERT INTO products')) state.count += 1;
      return { rows: [] };
    },
    state,
  };
}

test('an empty catalogue is seeded with products and coupons', async () => {
  const db = fakeDb(0);
  const result = await seedIfEmpty(db);
  assert.equal(result.seeded, true);
  assert.ok(result.products > 0);
  const inserts = db.calls.filter((c) => c.text.startsWith('INSERT INTO products'));
  assert.equal(inserts.length, result.products, 'one upsert per product');
  assert.ok(db.calls.some((c) => c.text.includes('INSERT INTO coupons')));
});

test('a populated catalogue is never touched', async () => {
  const db = fakeDb(7);
  const result = await seedIfEmpty(db);
  assert.equal(result.seeded, false);
  assert.equal(result.products, 7);
  assert.equal(db.calls.filter((c) => c.text.startsWith('INSERT INTO products')).length, 0,
    'operator data must not be overwritten on redeploy');
});

test('seedOnBoot is skipped under test and when disabled', async () => {
  const db = fakeDb(0);
  assert.deepEqual(await seedOnBoot(db, { env: { NODE_ENV: 'test' } }), { seeded: false, skipped: true });
  assert.deepEqual(await seedOnBoot(db, { env: { SEED_ON_BOOT: 'false' } }), { seeded: false, skipped: true });
  assert.equal(db.calls.length, 0, 'no queries when skipped');
});

test('seedOnBoot reports what it did, and swallows failures', async () => {
  const db = fakeDb(0);
  const logs = [];
  const result = await seedOnBoot(db, { env: {}, log: (m) => logs.push(m) });
  assert.equal(result.seeded, true);
  assert.ok(logs.some((l) => /empty catalogue/.test(l)));

  const broken = { async query() { throw new Error('db down'); } };
  const failed = await seedOnBoot(broken, { env: {}, log: (m) => logs.push(m) });
  assert.equal(failed.seeded, false);
  assert.match(failed.error, /db down/);
  assert.ok(logs.some((l) => /skipped \(db down\)/.test(l)), 'a failed seed must not crash boot');
});
