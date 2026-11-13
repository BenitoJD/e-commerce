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

test('checkout never hard-requires the state picker', () => {
  const src = fs.readFileSync(path.join(STOREFRONT, 'app', 'checkout', 'page.js'), 'utf8');
  // If /store/states fails the select has no options; a hardcoded `required` would make the
  // whole checkout unsubmittable, so requirement must come from the loaded options.
  assert.match(src, /required=\{stateFieldRequired\(states\)\}/, 'state select must derive its required flag');
  assert.doesNotMatch(src, /aria-label="Delivery state"[^>]*\brequired\b(?!=\{)/, 'state select must not be unconditionally required');
});

test('the admin product form can set every catalogue field the API stores', () => {
  // The form only renders after the admin token is entered, so it is invisible to the
  // server-rendered smoke audit — assert the controls statically instead.
  const src = fs.readFileSync(path.join(STOREFRONT, 'app', 'admin', 'page.js'), 'utf8');
  for (const label of ['Category', 'Subcategory', 'Product description', 'Video URLs', 'Image paths', 'HSN code']) {
    assert.ok(src.includes(`aria-label="${label}"`), `admin product form is missing a "${label}" control`);
  }
  // The payload must carry what the pickers collect, or the form silently drops it.
  for (const field of ['subcategory:', 'description:', 'videos:']) {
    assert.ok(src.includes(field), `product save payload is missing ${field}`);
  }
});

test('the header exposes the shopper tools (wishlist, compare, cart)', () => {
  const src = fs.readFileSync(path.join(STOREFRONT, 'app', 'layout.js'), 'utf8');
  for (const href of ['/wishlist', '/compare']) {
    assert.ok(src.includes(`href="${href}"`), `header is missing a ${href} link`);
  }
  // Cart is a live-count client island; the href lives in CartBadge, rendered by the header.
  assert.match(src, /<CartBadge\s*\/>/, 'header should render the cart badge');
  const badge = fs.readFileSync(path.join(STOREFRONT, 'components', 'CartBadge.js'), 'utf8');
  assert.ok(badge.includes('href="/cart"'), 'CartBadge should link to /cart');
  // Compare lives in localStorage, so a header entry point is the only way to reach it.
  assert.match(src, /href="\/compare"[^>]*>⇄ Compare/, 'compare link should be labelled for shoppers');
});
