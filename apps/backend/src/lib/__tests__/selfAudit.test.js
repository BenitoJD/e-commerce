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

test('contract tests normalise line endings before matching multi-line markers', () => {
  // A fresh checkout on Windows uses CRLF, so a marker containing "\n" never matched -
  // a failure that only appeared in the fresh-checkout run, never locally.
  const src = fs.readFileSync(path.join(ROOT, 'apps', 'backend', 'src', 'lib', '__tests__', 'trackingContract.test.js'), 'utf8');
  assert.match(src, /replace\(\/\\r\\n\/g, '\\n'\)/, 'multi-line marker matching must normalise CRLF');
});

test('the end-to-end script exists and is documented', () => {
  const e2e = path.join(ROOT, 'scripts', 'e2e-local.cjs');
  assert.ok(fs.existsSync(e2e), 'scripts/e2e-local.cjs must exist');
  const src = fs.readFileSync(e2e, 'utf8');
  for (const flow of ['checkout/create', 'service/track', 'service/returns', 'admin/orders', 'webhooks/razorpay']) {
    assert.ok(src.includes(flow), `e2e must exercise ${flow}`);
  }
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /scripts\/e2e-local\.cjs/, 'README must document how to run it');
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
