const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Support + GST filing both need the invoice from the admin console. Operators should not
// have to hand-build /invoice/<receipt>, so the link must exist in the orders table and in
// the order detail panel.
const ADMIN = path.resolve(__dirname, '..', '..', '..', '..', '..', 'apps', 'storefront', 'app', 'admin', 'page.js');

test('admin can open an order GST invoice from the orders table and detail panel', () => {
  const src = fs.readFileSync(ADMIN, 'utf8');
  const links = src.match(/href=\{`\/invoice\/\$\{encodeURIComponent\([^)]*\)\}`\}/g) || [];
  assert.ok(links.length >= 2, `expected invoice links for row + detail, found ${links.length}`);
  assert.match(src, /Open GST invoice/, 'detail panel needs a labelled invoice action');
});
