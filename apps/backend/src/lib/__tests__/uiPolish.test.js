const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Admin console navigation: the tabs are the only way to move between queues, so they need
// to be a labelled landmark and expose which one is active to assistive tech.
const STOREFRONT = path.resolve(__dirname, '..', '..', '..', '..', '..', 'apps', 'storefront');
const ADMIN = path.join(STOREFRONT, 'app', 'admin', 'page.js');

test('admin section tabs are a labelled landmark with an active marker', () => {
  const src = fs.readFileSync(ADMIN, 'utf8');
  assert.match(src, /<nav aria-label="Admin sections"/, 'tabs must live in a labelled nav');
  assert.match(src, /aria-current=\{tab === key \? 'true' : undefined\}/, 'the active tab must be announced');
});

test('product page states the saving in rupees, not just a percentage', () => {
  const src = fs.readFileSync(path.join(STOREFRONT, 'components', 'ProductView.js'), 'utf8');
  assert.match(src, /You save ₹/, 'shoppers should see the absolute saving');
  assert.match(src, /off MRP/, 'and what it is measured against');
});

test('the header exposes the shopper tools (wishlist, compare, cart)', () => {
  const src = fs.readFileSync(path.join(STOREFRONT, 'app', 'layout.js'), 'utf8');
  for (const href of ['/wishlist', '/compare', '/cart']) {
    assert.ok(src.includes(`href="${href}"`), `header is missing a ${href} link`);
  }
  // Compare lives in localStorage, so a header entry point is the only way to reach it.
  assert.match(src, /href="\/compare"[^>]*>⇄ Compare/, 'compare link should be labelled for shoppers');
});
