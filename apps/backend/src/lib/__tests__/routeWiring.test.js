const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Wiring audit: every page must be reachable (linked or in the sitemap), every sitemap entry
// must map to a real page, and nothing may be orphaned. This is the "did we miss a feature"
// guard — a page that exists but nothing links to it is effectively missing.
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const APP = path.join(ROOT, 'apps', 'storefront', 'app');
const COMPONENTS = path.join(ROOT, 'apps', 'storefront', 'components');
const SITEMAP = path.join(ROOT, 'apps', 'backend', 'src', 'routes', 'sitemap.js');

// Routes that are intentionally not linked/indexed (per-account or transactional surfaces).
const PRIVATE = new Set([
  '/cart', '/checkout', '/wishlist', '/compare', '/my-orders', '/track-order',
  '/order-success', '/returns', '/invoice', '/admin', '/admin/picking',
]);

function pageRoutes(dir = APP, prefix = '') {
  const routes = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const seg = entry.name.startsWith('(') ? '' : `/${entry.name}`;
      routes.push(...pageRoutes(full, `${prefix}${seg}`));
    } else if (entry.name === 'page.js') {
      routes.push(prefix || '/');
    }
  }
  return routes;
}

function dynamicPattern(route) {
  return route.replace(/\/\[[^\]]+\]/g, '/:param');
}

function staticRoutes() {
  return pageRoutes().filter((r) => !r.includes('['));
}

function dynamicRoutes() {
  return pageRoutes().filter((r) => r.includes('['));
}

function hrefs(dir) {
  const found = new Set();
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs)$/.test(entry.name)) {
        const src = fs.readFileSync(full, 'utf8');
        for (const m of src.matchAll(/href=(?:"|\{[\s`'"]?)(\/[a-z0-9\-/[\]]*)/gi)) {
          found.add(m[1].replace(/\/$/, '') || '/');
        }
      }
    }
  };
  walk(dir);
  return found;
}

function sitemapPaths() {
  const src = fs.readFileSync(SITEMAP, 'utf8');
  const literal = [...src.matchAll(/^\s*'(\/[^']+)',?$/gm)].map((m) => m[1]);
  return { literal, src };
}

test('every public page is linked from the UI or listed in the sitemap', () => {
  const links = hrefs(APP);
  const componentLinks = hrefs(COMPONENTS);
  for (const l of componentLinks) links.add(l);

  const { literal } = sitemapPaths();
  const sitemap = new Set(literal);

  const orphans = [];
  for (const route of staticRoutes()) {
    if (PRIVATE.has(route)) continue;
    // "/" is always reachable via the logo/footer.
    if (route === '/') continue;
    if (sitemap.has(route)) continue;
    if (links.has(route)) continue;
    orphans.push(route);
  }
  assert.deepEqual(orphans, [], `pages nothing links to and the sitemap omits: ${orphans.join(', ')}`);
});

test('every sitemap entry maps to a real page route', () => {
  const { literal } = sitemapPaths();
  const pages = pageRoutes().map(dynamicPattern);

  const missing = [];
  for (const entry of literal) {
    // Category paths are generated from the taxonomy and served by the category templates.
    if (entry === '/category/all' || entry.startsWith('/category/')) {
      const depth = entry.split('/').filter(Boolean).length;
      const pattern = depth >= 3 ? '/category/:param/:param' : '/category/:param';
      if (!pages.includes(pattern)) missing.push(`${entry} (no ${pattern} template)`);
      continue;
    }
    if (entry.startsWith('/product/')) {
      if (!pages.includes('/product/:param')) missing.push(`${entry} (no product page)`);
      continue;
    }
    if (entry.startsWith('/brand/')) {
      if (!pages.includes('/brand/:param')) missing.push(`${entry} (no brand page)`);
      continue;
    }
    if (!pages.includes(entry)) missing.push(entry);
  }
  assert.deepEqual(missing, [], `sitemap advertises routes with no page: ${missing.join(', ')}`);
});

test('private surfaces are excluded from the sitemap by design', () => {
  const { literal } = sitemapPaths();
  for (const route of PRIVATE) {
    if (route.includes('[')) continue;
    assert.ok(!literal.includes(route), `${route} is private but appears in the sitemap`);
  }
});

test('every dynamic page template is reachable from something that links to it', () => {
  const links = hrefs(APP);
  for (const l of hrefs(COMPONENTS)) links.add(l);
  const dynamic = dynamicRoutes();
  assert.ok(dynamic.length >= 5, `expected the main dynamic templates, found ${dynamic.length}`);

  // A template whose base path is never linked would only be reachable by guessing a URL.
  const baseOf = (route) => {
    const idx = route.indexOf('/[');
    return idx === -1 ? route : route.slice(0, idx) || '/';
  };
  const unlinked = [];
  for (const route of dynamic) {
    const base = baseOf(route);
    // /product/x is linked as `/product/${slug}` → the literal prefix is what we can see.
    const linkedPrefix = [...links].some((h) => h.startsWith(base.replace(/\/$/, '')) || base === '/');
    if (!linkedPrefix) unlinked.push(route);
  }
  assert.deepEqual(unlinked, [], `dynamic templates nobody links to: ${unlinked.join(', ')}`);
});

test('the documented route count matches the pages on disk', () => {
  const pages = pageRoutes().length;
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const claim = readme.match(/App Router \((\d+) routes?\)/);
  assert.ok(claim, 'README states the App Router route count');
  assert.equal(Number(claim[1]), pages, `README says ${claim[1]}, disk has ${pages}`);
});
