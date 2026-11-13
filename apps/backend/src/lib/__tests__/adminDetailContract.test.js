const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Contract for the admin order-detail panel: it is the surface an operator uses to answer a
// dispute ("why was I charged X?"), so a renamed field there silently blanks the invoice
// numbers or the reconcile warning rather than failing a build.
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const ADMIN_ROUTE = path.join(ROOT, 'apps', 'backend', 'src', 'routes', 'admin.js');
const ADMIN_PAGE = path.join(ROOT, 'apps', 'storefront', 'app', 'admin', 'page.js');

function orderDetailPayload() {
  const src = fs.readFileSync(ADMIN_ROUTE, 'utf8');
  const start = src.indexOf('order: {');
  assert.ok(start > -1, 'order detail payload not found');
  const objStart = src.indexOf('{', start);
  let depth = 0;
  for (let i = objStart; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(objStart, i + 1);
    }
  }
  throw new Error('unbalanced payload');
}

function payloadKeys(block) {
  const keys = new Set();
  for (const m of block.matchAll(/(?:^|[{,\s])([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)) keys.add(m[1]);
  for (const m of block.matchAll(/^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*)[ \t]*,[ \t]*$/gm)) keys.add(m[1]);
  return keys;
}

function detailReads() {
  const src = fs.readFileSync(ADMIN_PAGE, 'utf8');
  const reads = new Set();
  for (const m of src.matchAll(/\borderDetail\??\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) reads.add(m[1]);
  return reads;
}

test('admin order detail sends every field the panel reads', () => {
  const keys = payloadKeys(orderDetailPayload());
  const missing = [...detailReads()].filter((k) => !keys.has(k));
  assert.deepEqual(missing, [], `admin detail panel reads fields the API never sends: ${missing.join(', ')}`);
});

test('the reconcile helper’s inputs are all present in the detail payload', () => {
  // The charge breakdown goes through lib/orderMath.reconcileOrder(), which reads these
  // keys off the order object — a rename there would show ₹0 without any page-level read
  // changing, so assert the helper's inputs directly.
  const helper = fs.readFileSync(path.join(ROOT, 'apps', 'storefront', 'lib', 'orderMath.js'), 'utf8');
  const inputs = new Set();
  for (const m of helper.matchAll(/\border\??\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) inputs.add(m[1]);

  const keys = payloadKeys(orderDetailPayload());
  const missing = [...inputs].filter((k) => !keys.has(k));
  assert.deepEqual(missing, [], `reconcileOrder reads fields the detail payload never sends: ${missing.join(', ')}`);
  assert.ok(inputs.has('amountPaise'), 'expected the helper to read amountPaise');
});

test('the detail payload keeps the money/handling fields the console depends on', () => {
  const keys = payloadKeys(orderDetailPayload());
  for (const required of ['receipt', 'status', 'amountPaise', 'discountPaise', 'shippingPaise', 'customer', 'items', 'payMode']) {
    assert.ok(keys.has(required), `order detail payload missing ${required}`);
  }
});
