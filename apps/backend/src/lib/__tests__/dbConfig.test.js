const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPoolConfig } = require('../dbConfig');

test('pool has bounded size and timeouts by default', () => {
  const cfg = buildPoolConfig({ DATABASE_URL: 'postgres://u:p@db:5432/x' });
  assert.equal(cfg.connectionString, 'postgres://u:p@db:5432/x');
  assert.equal(cfg.application_name, 'toolsvilla-api');
  assert.equal(cfg.max, 10);
  assert.equal(cfg.connectionTimeoutMillis, 5000);
  assert.equal(cfg.idleTimeoutMillis, 30000);
  assert.equal(cfg.statement_timeout, 15000);
  assert.equal(cfg.query_timeout, 15000, 'client-side timeout mirrors the server one');
});

test('a missing DATABASE_URL keeps the documented local default', () => {
  const cfg = buildPoolConfig({});
  assert.match(cfg.connectionString, /localhost:5432\/toolsvilla$/);
});

test('environment overrides are honoured', () => {
  const cfg = buildPoolConfig({
    DATABASE_URL: 'postgres://u:p@db:5432/x',
    DB_POOL_MAX: '25',
    DB_CONNECT_TIMEOUT_MS: '2000',
    DB_IDLE_TIMEOUT_MS: '10000',
    DB_STATEMENT_TIMEOUT_MS: '4000',
  });
  assert.equal(cfg.max, 25);
  assert.equal(cfg.connectionTimeoutMillis, 2000);
  assert.equal(cfg.idleTimeoutMillis, 10000);
  assert.equal(cfg.statement_timeout, 4000);
  assert.equal(cfg.query_timeout, 4000, 'both timeouts follow the same env var');
});

test('junk or non-positive values fall back instead of breaking the pool', () => {
  for (const bad of ['abc', '0', '-5', '', '   ']) {
    const cfg = buildPoolConfig({
      DATABASE_URL: 'postgres://u:p@db:5432/x',
      DB_POOL_MAX: bad,
      DB_CONNECT_TIMEOUT_MS: bad,
      DB_STATEMENT_TIMEOUT_MS: bad,
    });
    assert.equal(cfg.max, 10, `DB_POOL_MAX=${JSON.stringify(bad)} should fall back`);
    assert.equal(cfg.connectionTimeoutMillis, 5000);
    assert.equal(cfg.statement_timeout, 15000);
  }
});
