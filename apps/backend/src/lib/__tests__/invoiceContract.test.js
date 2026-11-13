const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Field-level contract: the invoice page reads specific keys off the API payload. A rename
// on either side would print zeros (or blanks) on a legal document without failing a build,
// so assert that every key the page reads exists in a real response from the route.
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const PAGE = path.join(ROOT, 'apps', 'storefront', 'app', 'invoice', '[receipt]', 'page.js');
const ROUTE = path.join(ROOT, 'apps', 'backend', 'src', 'routes', 'invoice.js');

// Keys the storefront is allowed to read that the API does not send (aliases/defaults).
const CLIENT_ONLY = new Set([
  'mode', 'paymentMode', 'time', 'date', 'note', 'invoice', 'length', 'at', 'status',
]);

function apiKeysFromRoute() {
  const src = fs.readFileSync(ROUTE, 'utf8');
  const start = src.indexOf('res.json({');
  const objStart = src.indexOf('{', start);
  // Walk to the matching brace so nested objects (gst) are included.
  let depth = 0;
  let end = -1;
  for (let i = objStart; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  const raw = src.slice(objStart, end + 1);
  const keys = new Set();
  // `name: value` at any depth...
  for (const m of raw.matchAll(/(?:^|[{,\s])([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)) keys.add(m[1]);
  // ...and ES shorthand (`items,`) which the route uses for most money fields.
  for (const m of raw.matchAll(/^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*)[ \t]*,[ \t]*$/gm)) keys.add(m[1]);
  return { raw, keys };
}

test('every invoice field the page reads exists in the API payload', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  const { raw, keys } = apiKeysFromRoute();

  const read = new Set();
  for (const m of page.matchAll(/\binv\??\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) read.add(m[1]);

  const missing = [];
  for (const key of read) {
    if (CLIENT_ONLY.has(key)) continue;
    // The page prefers camelCase and falls back to snake_case (or vice versa); the API
    // only has to send one of the two spellings.
    const camelOf = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const snakeOf = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    const candidates = [key, camelOf(key), snakeOf(key)];
    if (!candidates.some((c) => keys.has(c) || raw.includes(`${c}:`))) missing.push(key);
  }
  assert.deepEqual(missing, [], `invoice page reads fields the API never sends: ${missing.join(', ')}`);
});

test('nested customer fields the page reads are actually sent', () => {
  const page = fs.readFileSync(PAGE, 'utf8');
  const route = fs.readFileSync(ROUTE, 'utf8');
  const customerBlock = route.slice(route.indexOf('customer: {'), route.indexOf('}', route.indexOf('customer: {')) + 1);

  const read = new Set();
  for (const m of page.matchAll(/\bcustomer\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) read.add(m[1]);

  const missing = [];
  for (const key of read) {
    const camelOf = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const snakeOf = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    if (![key, camelOf, snakeOf].some((c) => customerBlock.includes(`${c}:`) || customerBlock.includes(c))) {
      missing.push(key);
    }
  }
  assert.deepEqual(missing, [], `invoice page reads customer fields the API never sends: ${missing.join(', ')}`);
});

test('the invoice payload carries the money fields the page reconciles with', () => {
  const { keys } = apiKeysFromRoute();
  for (const key of ['items', 'discountPaise', 'shippingPaise', 'grandPaise', 'gst', 'receipt']) {
    assert.ok(keys.has(key), `invoice payload is missing ${key}`);
  }
});

test('item lines expose the per-line fields the invoice table renders', () => {
  const route = fs.readFileSync(ROUTE, 'utf8');
  for (const field of ['linePaise', 'unitPaise', 'qty', 'name', 'hsn']) {
    assert.match(route, new RegExp(`${field}`), `invoice items should carry ${field}`);
  }
});
