// Frontend↔backend API contract test.
// Extracts every URL the storefront calls (lib/api.js) and every route the backend
// actually mounts, then asserts each frontend call resolves to a real route.
// Catches drift like calling an endpoint that was renamed or never built.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BACKEND = path.join(__dirname, '..', '..', '..');            // apps/backend
const STOREFRONT = path.join(BACKEND, '..', 'storefront');          // apps/storefront

// ---------- helpers ----------

// Treat any dynamic segment (`${...}` on the client, `:param` on the server) as `:x`.
// A `${...}` NOT preceded by "/" is a query tail (e.g. `?${q}`), not a path segment.
function normalizePath(p) {
  return String(p)
    .split('?')[0]
    .split('&')[0]
    .replace(/\$\{.*$/, '')                          // unterminated template (nested backticks)
    .replace(/(\/?)\$\{[^}]*\}/g, (m, slash) => (slash ? '/:x' : ''))
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, ':x')
    .replace(/\/+$/, '') || '/';
}

function segments(p) {
  return normalizePath(p).split('/').filter(Boolean);
}

// How a router actually resolves: compare the static prefix up to the first dynamic
// segment. `/admin/quotes${q}` (a query tail) resolves to `/admin/quotes`;
// `/store/products/${slug}` resolves to `/store/products/:slug`.
function staticPrefix(p) {
  const out = [];
  for (const seg of segments(p)) {
    if (seg === ':x') break;
    out.push(seg);
  }
  return out;
}

function pathMatches(frontendPath, backendPath) {
  const f = staticPrefix(frontendPath);
  const b = staticPrefix(backendPath);
  if (f.length !== b.length) return false;
  return f.every((seg, i) => seg === b[i]);
}

// ---------- extract backend routes ----------

const ROUTER_FILES = {
  productsRouter: 'products.js',
  checkoutRouter: 'checkout.js',
  webhooksRouter: 'webhooks.js',
  quotesRouter: 'quotes.js',
  adminRouter: 'admin.js',
  searchRouter: 'search.js',
  engagementRouter: 'engagement.js',
  serviceRouter: 'service.js',
  invoiceRouter: 'invoice.js',
  brandsRouter: 'brands.js',
  dealsRouter: 'deals.js',
};

function backendRoutes() {
  const indexSrc = fs.readFileSync(path.join(BACKEND, 'src', 'index.js'), 'utf8');
  const routes = [];

  // app.use('/mount', someRouter)
  const mountRe = /app\.use\(\s*'([^']+)'\s*,\s*(?:express\.raw\([^)]*\)\s*,\s*)?(\w+Router)/g;
  let m;
  while ((m = mountRe.exec(indexSrc))) {
    const mount = m[1];
    const file = ROUTER_FILES[m[2]];
    assert.ok(file, `unknown router variable in index.js: ${m[2]}`);
    const src = fs.readFileSync(path.join(BACKEND, 'src', 'routes', file), 'utf8');
    const routeRe = /router\.(get|post|patch|delete|put)\(\s*'([^']+)'/g;
    let r;
    let found = 0;
    while ((r = routeRe.exec(src))) {
      found += 1;
      const full = `${mount}${r[2] === '/' ? '' : r[2]}`;
      routes.push({ path: full, method: r[1].toUpperCase(), file });
    }
    assert.ok(found > 0, `no router.<verb> routes found in ${file}`);
  }

  // app.get('/literal', handler) directly on the app (e.g. health, sitemap)
  const appGetRe = /app\.get\(\s*'([^']+)'\s*,/g;
  while ((m = appGetRe.exec(indexSrc))) {
    routes.push({ path: m[1], method: 'GET', file: 'index.js' });
  }

  return routes;
}

// ---------- extract frontend calls ----------

function frontendCalls() {
  const src = fs.readFileSync(path.join(STOREFRONT, 'lib', 'api.js'), 'utf8');
  const calls = [];
  const re = /fetch\(`\$\{BASE\}([^`]*)`/g;
  let m;
  while ((m = re.exec(src))) {
    calls.push(normalizePath(m[1]));
  }
  return calls;
}

// ---------- tests ----------

const routes = backendRoutes();
const calls = frontendCalls();

test('backend mounts a substantial number of routes', () => {
  assert.ok(routes.length >= 40, `expected >=40 backend routes, found ${routes.length}`);
});

test('storefront makes real API calls', () => {
  assert.ok(calls.length >= 20, `expected >=20 frontend calls, found ${calls.length}`);
});

test('every storefront API call resolves to a mounted backend route', () => {
  const missing = [];
  for (const call of calls) {
    const hit = routes.some((r) => pathMatches(call, r.path));
    if (!hit) missing.push(call);
  }
  assert.deepEqual(missing, [], `frontend calls with no backend route:\n${missing.join('\n')}`);
});

test('critical customer journeys are wired end to end', () => {
  const required = [
    '/store/products',
    '/store/checkout/create',
    '/store/checkout/verify',
    '/store/engage/reviews/:x',
    '/store/engage/coupons/validate',
    '/store/service/pincode/:x',
    '/store/service/track',
    '/store/service/orders',
    '/store/service/cancel',
    '/store/invoice/:x',
    '/store/quotes',
    '/admin/stats',
    '/admin/orders',
    '/admin/quotes',
  ];
  for (const want of required) {
    const hit = routes.some((r) => pathMatches(want, r.path));
    assert.ok(hit, `missing backend route for journey: ${want}`);
  }
});

test('webhook route is separate from JSON body parsing (raw signature check)', () => {
  const indexSrc = fs.readFileSync(path.join(BACKEND, 'src', 'index.js'), 'utf8');
  const rawIdx = indexSrc.indexOf("express.raw(");
  const jsonIdx = indexSrc.indexOf('express.json(');
  assert.ok(rawIdx > 0 && jsonIdx > 0);
  assert.ok(rawIdx < jsonIdx, 'webhook raw parser must be registered before express.json');
});
