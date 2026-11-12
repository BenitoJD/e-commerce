const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Client components can't export `metadata`, so every 'use client' page needs a sibling
// layout.js providing a title. Before this existed, 11 pages all inherited the root title.
const APP = path.resolve(__dirname, '..', '..', '..', '..', '..', 'apps', 'storefront', 'app');

const PRIVATE_ROUTES = new Set([
  'admin', 'cart', 'checkout', 'wishlist', 'my-orders', 'track-order', 'returns', 'order-success',
]);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name === 'page.js') out.push(p);
  }
  return out;
}

test('every client-rendered page has a metadata layout', () => {
  const pages = walk(APP, []).filter((p) => fs.readFileSync(p, 'utf8').startsWith("'use client';"));
  assert.ok(pages.length > 5, 'expected several client pages');

  const missing = [];
  for (const page of pages) {
    const layout = path.join(path.dirname(page), 'layout.js');
    if (!fs.existsSync(layout)) {
      missing.push(path.relative(APP, page));
      continue;
    }
    const src = fs.readFileSync(layout, 'utf8');
    if (!/^\s*export const metadata/m.test(src) || !/title:/.test(src)) {
      missing.push(`${path.relative(APP, page)} (layout without title)`);
    }
  }
  assert.deepEqual(missing, [], `client pages missing metadata:\n${missing.join('\n')}`);
});

test('private client pages are noindex', () => {
  for (const route of PRIVATE_ROUTES) {
    const layout = path.join(APP, route, 'layout.js');
    assert.ok(fs.existsSync(layout), `${route} should have a metadata layout`);
    const src = fs.readFileSync(layout, 'utf8');
    assert.match(src, /robots:\s*\{\s*index:\s*false/, `${route} should be noindex`);
  }
});

test('public client pages keep a canonical URL and are indexable', () => {
  for (const route of ['contact-us', 'bulk-quote']) {
    const src = fs.readFileSync(path.join(APP, route, 'layout.js'), 'utf8');
    assert.match(src, /alternates:\s*\{\s*canonical/, `${route} should declare a canonical URL`);
    assert.equal(/index:\s*false/.test(src), false, `${route} must stay indexable`);
  }
});
