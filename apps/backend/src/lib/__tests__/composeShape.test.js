const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// docker-compose.yml is the deployment artifact nobody can test locally (no Docker here),
// and it has twice been broken by text edits: a duplicated build arg and a build arg
// promoted to a service-level key. `docker compose up` rejects those with a confusing
// error at deploy time, so validate it in CI instead.
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'validate-compose.cjs');

test('docker-compose.yml parses with no duplicate or misplaced keys', () => {
  assert.ok(fs.existsSync(SCRIPT), 'validate-compose.cjs should exist');
  const res = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: process.env });
  assert.equal(res.status, 0, `compose validation failed:\n${res.stdout}\n${res.stderr}`);
});

test('compose passes the policy and CORS env the backend reads', () => {
  const compose = fs.readFileSync(path.join(REPO, 'docker-compose.yml'), 'utf8');
  for (const key of ['FRONTEND_URL', 'COD_MAX_PAISE', 'RATE_LIMIT_MAX', 'ADMIN_RATE_LIMIT_MAX', 'LOOKUP_RATE_LIMIT_MAX']) {
    assert.ok(compose.includes(`${key}:`), `compose should pass ${key} to the backend`);
  }
  // storefront needs both bases: browser (public) and server (internal)
  assert.ok(compose.includes('NEXT_PUBLIC_BACKEND_URL:'));
  assert.ok(compose.includes('BACKEND_INTERNAL_URL:'));
});
