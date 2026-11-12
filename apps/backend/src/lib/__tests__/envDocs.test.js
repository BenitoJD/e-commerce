const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A self-hosted deployment fails silently when an env var is read by the code but never
// documented: the app boots, then quietly uses a wrong default. This test keeps
// .env.example honest against actual usage.
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');

const SOURCE_ROOTS = [
  'apps/backend/src',
  'apps/backend/data',
  'apps/storefront/app',
  'apps/storefront/components',
  'apps/storefront/lib',
  'apps/storefront/next.config.js',
];

// Documented intentionally elsewhere or supplied by the platform.
const ALLOWED_UNDOCUMENTED = new Set([
  'NODE_ENV', // platform
  'PORT', // compose sets it per service; documented in compose
  'PATH', // platform
]);

function walkFiles(entry, out) {
  const p = path.isAbsolute(entry) ? entry : path.join(REPO, entry);
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(p)) {
      if (/node_modules|\.next|\.git/.test(name)) continue;
      walkFiles(path.join(p, name), out);
    }
  } else if (/\.(js|mjs|cjs)$/.test(p)) {
    out.push(p);
  }
}

test('every env var the code reads is documented in .env.example', () => {
  const files = [];
  SOURCE_ROOTS.forEach((r) => walkFiles(r, files));

  const used = new Set();
  const re = /process\.env\.([A-Z0-9_]+)/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(text)) !== null) used.add(m[1]);
  }

  const envExample = fs.readFileSync(path.join(REPO, '.env.example'), 'utf8');
  const documented = new Set();
  for (const line of envExample.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m) documented.add(m[1]);
  }

  const missing = [...used].filter((k) => !documented.has(k) && !ALLOWED_UNDOCUMENTED.has(k)).sort();
  assert.deepEqual(missing, [], `env vars read by code but missing from .env.example:\n${missing.join('\n')}`);
});

test('.env.example does not document secrets with real-looking values', () => {
  const envExample = fs.readFileSync(path.join(REPO, '.env.example'), 'utf8');
  // Any key that looks live (rzp_live, sk_live, AKIA...) would leak if committed.
  assert.equal(/rzp_live_[A-Za-z0-9]+/.test(envExample), false);
  assert.equal(/AKIA[0-9A-Z]{16}/.test(envExample), false);
  // Placeholders must be obviously fake.
  assert.ok(envExample.includes('ADMIN_TOKEN='), 'ADMIN_TOKEN should be documented');
});
