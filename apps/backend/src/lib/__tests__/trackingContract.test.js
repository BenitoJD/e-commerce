const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Field-level contracts for the customer tracking screens. Both pages read one flat object
// per order (plus a timeline), and a renamed field would blank the UI without failing a
// build — the same failure mode found on the invoice and product pages.
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SERVICE = path.join(ROOT, 'apps', 'backend', 'src', 'routes', 'service.js');
const TRACK_PAGE = path.join(ROOT, 'apps', 'storefront', 'app', 'track-order', 'page.js');
const ORDERS_PAGE = path.join(ROOT, 'apps', 'storefront', 'app', 'my-orders', 'page.js');

function blockAfter(marker) {
  const src = fs.readFileSync(SERVICE, 'utf8');
  const start = src.indexOf(marker);
  assert.ok(start > -1, `marker not found: ${marker}`);
  const objStart = src.indexOf('{', start);
  let depth = 0;
  for (let i = objStart; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(objStart, i + 1);
    }
  }
  throw new Error('unbalanced object');
}

function keysIn(block, { nested = false } = {}) {
  const keys = new Set();
  for (const m of block.matchAll(/(?:^|[{,\s])([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)) keys.add(m[1]);
  for (const m of block.matchAll(/^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*)[ \t]*,[ \t]*$/gm)) keys.add(m[1]);
  if (nested) {
    for (const m of block.matchAll(/([a-zA-Z_]+):\s*\{/g)) keys.add(m[1]);
  }
  return keys;
}

function readsFrom(pagePath, receiver) {
  const src = fs.readFileSync(pagePath, 'utf8');
  const reads = new Set();
  const re = new RegExp(`\\b${receiver}\\??\\.([a-zA-Z_][a-zA-Z0-9_]*)`, 'g');
  for (const m of src.matchAll(re)) reads.add(m[1]);
  return reads;
}

// The pages deliberately accept several spellings; the API only has to send one.
function existsAnywhere(keys, name) {
  const camel = name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const snake = name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return keys.has(name) || keys.has(camel) || keys.has(snake);
}

test('track endpoint sends every field the tracking page reads', () => {
  const keys = keysIn(blockAfter("router.get('/track'"));
  // `amount` is a client-side convenience fallback next to amount_paise.
  const clientOnly = new Set(['amount']);
  const missing = [...readsFrom(TRACK_PAGE, 'data')]
    .filter((k) => !clientOnly.has(k))
    .filter((k) => !existsAnywhere(keys, k));
  assert.deepEqual(missing, [], `track page reads fields the API never sends: ${missing.join(', ')}`);
  for (const required of ['receipt', 'status', 'amount_paise', 'items', 'timeline']) {
    assert.ok(keys.has(required), `track payload missing ${required}`);
  }
});

test('my-orders endpoint sends every field the orders page reads', () => {
  const block = blockAfter("res.json({\n      orders:");
  const keys = keysIn(block, { nested: true });
  // The page renders `receipt || id || orderId` and `created_at || date`; the API
  // deliberately exposes the receipt (a public handle) rather than internal integer ids, so
  // these alternatives are allowed to be absent as long as the primaries exist.
  const fallbacks = new Set(['id', 'orderId', 'date', 'amount']);
  const missing = [...readsFrom(ORDERS_PAGE, 'o')]
    .filter((k) => !fallbacks.has(k))
    .filter((k) => !existsAnywhere(keys, k));
  assert.deepEqual(missing, [], `my-orders page reads fields the API never sends: ${missing.join(', ')}`);
  for (const required of ['receipt', 'status', 'amount_paise', 'itemCount', 'items']) {
    assert.ok(keys.has(required), `orders payload missing ${required}`);
  }
});

test('timeline entries carry the keys the page renders', () => {
  const src = fs.readFileSync(SERVICE, 'utf8');
  const start = src.indexOf('function buildTimeline');
  const fn = src.slice(start, src.indexOf('\n}', start));
  for (const key of ['status', 'label', 'at']) {
    assert.match(fn, new RegExp(`${key}:`), `timeline entries should include ${key}`);
  }
  const page = fs.readFileSync(TRACK_PAGE, 'utf8');
  assert.match(page, /t\.label/, 'page should render the human label');
  assert.match(page, /t\.at/, 'page should render the timestamp it was given');
});
