const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The backup/restore scripts run on the VPS, not in CI, so their safety properties are
// asserted structurally. What matters: a failed dump can't look successful, a restore can't
// run without explicit confirmation, and dumps can't be committed.
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const backup = path.join(ROOT, 'scripts', 'db-backup.sh');
const restore = path.join(ROOT, 'scripts', 'db-restore.sh');

test('both scripts fail fast and validate their output', () => {
  const b = fs.readFileSync(backup, 'utf8');
  assert.match(b, /set -euo pipefail/, 'a failed dump must not continue silently');
  assert.match(b, /gzip -t/, 'the dump is verified as valid gzip');
  assert.match(b, /pg_dump/, 'uses pg_dump');
  assert.match(b, /KEEP/, 'has retention handling');
  // Tooling is detected before creating directories (a failed run leaves nothing behind).
  assert.ok(b.indexOf('command -v pg_dump') < b.indexOf('mkdir -p'), 'detect tooling before mkdir');
});

test('restore refuses to run without explicit confirmation', () => {
  const r = fs.readFileSync(restore, 'utf8');
  assert.match(r, /set -euo pipefail/);
  assert.match(r, /RESTORE_CONFIRM/, 'destructive restore needs a confirmation variable');
  assert.ok(r.indexOf('RESTORE_CONFIRM') < r.indexOf('psql'), 'confirmation is checked before touching the DB');
  assert.match(r, /ON_ERROR_STOP=1/, 'a partial restore should abort rather than continue');
});

test('database dumps cannot be committed', () => {
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(ignore, /\/backups\//);
  assert.match(ignore, /\.sql\.gz/);
});
