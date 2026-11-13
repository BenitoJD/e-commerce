const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// `self-audit.mjs` is the reproducible version of the manual ritual used during development:
// fixture backend + built storefront + smoke + page audit. Its failure modes are silent
// (fixture on the wrong port, cleanup skipped), so the wiring is asserted here.
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const SELF = path.join(ROOT, 'scripts', 'self-audit.mjs');
const FIXTURE = path.join(ROOT, 'scripts', 'fixture-backend.mjs');

test('self-audit boots both servers and runs the two live suites', () => {
  const src = fs.readFileSync(SELF, 'utf8');
  assert.match(src, /fixture-backend\.mjs/, 'must start the fixture backend');
  assert.match(src, /next',\s*'dist',\s*'bin',\s*'next'/, 'must start the built storefront');
  assert.match(src, /smoke\.mjs/);
  assert.match(src, /audit-pages\.mjs/);
  assert.match(src, /crawl-sitemap\.mjs/, 'the crawl covers every advertised URL, not a hand list');
  assert.match(src, /cleanup\(\)/, 'must always clean up child processes');
});

test('self-audit listens where the build baked its sitemap rewrite', () => {
  const src = fs.readFileSync(SELF, 'utf8');
  assert.match(src, /routes-manifest\.json/, 'the baked BACKEND_INTERNAL_URL lives in the routes manifest');
  assert.match(src, /bakedBackendPort/, 'a mismatch makes /sitemap.xml 500 against the fixture');
  assert.match(src, /BUILD_ID/, 'refuse to run before a build exists');
});

test('fixture backend serves the real catalogue rather than invented data', () => {
  const src = fs.readFileSync(FIXTURE, 'utf8');
  for (const dataFile of ['products.js', 'categories.js', 'states.js']) {
    assert.ok(src.includes(dataFile), `fixture should read data/${dataFile}`);
  }
  for (const route of ['/store/products', '/store/categories', '/store/brands', '/store/states', '/sitemap.xml', '/store/invoice']) {
    assert.ok(src.includes(route), `fixture is missing ${route}`);
  }
  assert.match(src, /x-admin-token/, 'admin routes should stay token-gated even in the fixture');
});
