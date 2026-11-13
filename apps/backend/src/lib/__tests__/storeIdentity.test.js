const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Store identity lives in one place: lib/store.js (env-overridable). A hardcoded brand
// name in a page means an operator who rebrands still ships "ToolsKart" to customers.
const APP = path.resolve(__dirname, '..', '..', '..', '..', '..', 'apps', 'storefront', 'app');

// lib/store.js itself must hold the default; these files may legitimately reference it.
const ALLOWED = new Set(['lib/store.js']);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.js$/.test(entry.name)) out.push(p);
  }
  return out;
}

test('no page hardcodes the store name (it must come from STORE)', () => {
  const offenders = [];
  for (const file of walk(APP, [])) {
    const rel = path.relative(APP, file).replace(/\\/g, '/');
    if (ALLOWED.has(rel)) continue;
    const src = fs.readFileSync(file, 'utf8');
    // Ignore imports/comments: only flag it inside JSX text or template strings.
    const lines = src.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (/\bToolsKart\b/.test(line) && !/from '.*lib\/store'/.test(line)) {
        offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `hardcoded store name found:\n${offenders.join('\n')}`);
});

test('store identity lives in lib/store.js with an env override', () => {
  const src = fs.readFileSync(path.resolve(APP, '..', 'lib', 'store.js'), 'utf8');
  assert.match(src, /NEXT_PUBLIC_STORE_NAME/);
  assert.match(src, /name:\s*process\.env\.NEXT_PUBLIC_STORE_NAME/);
  // Invoice letterhead details must be configurable too, not baked into a page.
  assert.match(src, /NEXT_PUBLIC_STORE_ADDRESS/);
  assert.match(src, /NEXT_PUBLIC_STORE_STATE_CODE/, 'seller GST state code drives the CGST/SGST vs IGST split');
});

test('no page hardcodes the seller postal address', () => {
  const offenders = [];
  for (const file of walk(APP, [])) {
    const rel = path.relative(APP, file).replace(/\\/g, '/');
    const src = fs.readFileSync(file, 'utf8');
    src.split(/\r?\n/).forEach((line, i) => {
      if (/MIDC Industrial Area|Plot 12/.test(line)) offenders.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `hardcoded seller address: ${offenders.join(', ')}`);
});
