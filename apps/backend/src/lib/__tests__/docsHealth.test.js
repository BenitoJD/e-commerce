const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Shell rewrites of these files have twice double-encoded them (UTF-8 read as ANSI and
// written back), quietly turning 6 KB of docs into 1.8 MB of mojibake. Cheap guard:
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

const DOCS = [
  'README.md',
  'docs/PARITY.md',
  'docs/VPS-DEPLOY.md',
  'docs/SETUP.md',
  'docs/RAZORPAY.md',
  '.env.example',
];

test('repo docs stay valid UTF-8 and free of mojibake', () => {
  for (const rel of DOCS) {
    const file = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(file)) continue; // optional docs
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(text.includes('\uFFFD'), false, `${rel} contains U+FFFD (bad decode)`);
    assert.equal(/Ãƒ|Ã¢â‚¬|â€š/.test(text), false, `${rel} looks double-encoded`);
    const bytes = Buffer.byteLength(text, 'utf8');
    assert.ok(bytes < 200 * 1024, `${rel} is suspiciously large (${bytes} bytes) — probably re-encoded`);
  }
});

test('README keeps its key sections and current test counts', () => {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
  for (const heading of ['## Structure', '## Tests', '## Razorpay', 'Admin console']) {
    assert.ok(readme.includes(heading), `README lost "${heading}"`);
  }
  assert.match(readme, /99 tests/);
  assert.match(readme, /35 tests/);
});
