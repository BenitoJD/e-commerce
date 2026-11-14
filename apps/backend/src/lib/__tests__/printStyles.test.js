const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Printing is a first-class flow here (GST invoices + the warehouse picking list), so the
// print rules must be global and the `.no-print` switch must actually be defined, an
// undefined class silently prints the buttons and controls onto paper.
const STOREFRONT = path.resolve(__dirname, '..', '..', '..', '..', '..', 'apps', 'storefront');

test('global stylesheet defines the no-print switch and hides chrome on paper', () => {
  const css = fs.readFileSync(path.join(STOREFRONT, 'app', 'globals.css'), 'utf8');
  assert.match(css, /@media print/, 'missing @media print block');
  assert.match(css, /\.no-print/, 'the .no-print class must be defined globally');
  assert.match(css, /\.print-card/, 'invoices rely on .print-card print styling');
});

test('pages that print use the shared class instead of their own stylesheet', () => {
  const picking = fs.readFileSync(path.join(STOREFRONT, 'app', 'admin', 'picking', 'page.js'), 'utf8');
  assert.match(picking, /no-print/, 'picking list controls must be excluded from print');
  const invoice = fs.readFileSync(path.join(STOREFRONT, 'app', 'invoice', '[receipt]', 'page.js'), 'utf8');
  assert.doesNotMatch(invoice, /<style>/, 'invoice should not carry its own print stylesheet any more');
});

test('keyboard focus is visible on buttons and links', () => {
  const css = fs.readFileSync(path.join(STOREFRONT, 'app', 'globals.css'), 'utf8');
  assert.match(css, /focus-visible/, 'missing a focus-visible rule');
  assert.match(css, /a:focus-visible/, 'links need a visible focus ring');
});
