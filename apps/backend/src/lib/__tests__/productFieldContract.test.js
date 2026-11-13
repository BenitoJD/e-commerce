const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Field-level contract for the product page: every `p.<field>` it reads must either be a
// column of the products table, or a value the storefront derives client-side. This is the
// guard that last round's invoice bug needed a sibling of — a page can read a field the API
// never returns and quietly render a blank.
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SCHEMA = path.join(ROOT, 'apps', 'backend', 'sql', 'schema.sql');
const PAGE = path.join(ROOT, 'apps', 'storefront', 'components', 'ProductView.js');

// Added by lib/api.js normalizeProduct() after the API response.
const DERIVED = new Set(['price', 'mrp', 'image', 'id']);

function productColumns() {
  const sql = fs.readFileSync(SCHEMA, 'utf8');
  const create = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS products'));
  const block = create.slice(0, create.indexOf(');'));
  const cols = new Set();
  for (const m of block.matchAll(/^\s{2}([a-z_]+)\s+/gm)) cols.add(m[1]);
  // Columns added by later ALTER statements are part of the table too.
  for (const m of sql.matchAll(/ALTER TABLE products ADD COLUMN IF NOT EXISTS ([a-z_]+)/g)) cols.add(m[1]);
  return cols;
}

function pageReads() {
  const src = fs.readFileSync(PAGE, 'utf8');
  const reads = new Set();
  for (const m of src.matchAll(/\bp\??\.([a-z_][a-z0-9_]*)/g)) reads.add(m[1]);
  return reads;
}

test('the product page only reads fields the products table actually has', () => {
  const cols = productColumns();
  assert.ok(cols.has('slug') && cols.has('price_paise') && cols.has('stock'), 'schema parse looks wrong');

  const missing = [...pageReads()].filter((f) => !cols.has(f) && !DERIVED.has(f));
  assert.deepEqual(missing, [], `ProductView reads fields no API response provides: ${missing.join(', ')}`);
});

test('normalizeProduct keeps the fields the page depends on', () => {
  const src = fs.readFileSync(path.join(ROOT, 'apps', 'storefront', 'lib', 'api.js'), 'utf8');
  const start = src.indexOf('export function normalizeProduct');
  assert.ok(start > -1, 'normalizeProduct must exist');
  // Take the whole function: from its declaration to the closing brace at column 0.
  const end = src.indexOf('\n}', start);
  const fn = src.slice(start, end === -1 ? start + 1200 : end);
  assert.match(fn, /\.\.\.p/, 'normalisation must spread the original fields, not whitelist them');
  for (const derived of ['price', 'mrp', 'image']) {
    assert.match(fn, new RegExp(`out\\.${derived}`), `normalizeProduct should derive ${derived}`);
  }
});
