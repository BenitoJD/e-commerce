const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Async feedback (coupon applied, pincode checked, quote sent) is invisible to screen
// readers unless it lands in a live region. Guards the ARIA combobox pattern too.
const STOREFRONT = path.resolve(__dirname, '..', '..', '..', '..', '..', 'apps', 'storefront');

function read(rel) {
  return fs.readFileSync(path.join(STOREFRONT, rel), 'utf8');
}

test('async form feedback uses live regions', () => {
  const expectations = [
    ['components/ProductView.js', ['role="status"']],
    ['app/cart/page.js', ['role="status"']],
    ['app/checkout/page.js', ['role="alert"']],
    ['app/returns/page.js', ['role="status"', 'role="alert"']],
    ['app/track-order/page.js', ['role="status"', 'role="alert"']],
    ['app/contact-us/page.js', ['role="status"', 'role="alert"']],
    ['app/bulk-quote/page.js', ['role="status"', 'role="alert"']],
  ];
  const missing = [];
  for (const [file, roles] of expectations) {
    const src = read(file);
    for (const role of roles) {
      if (!src.includes(role)) missing.push(`${file} missing ${role}`);
    }
  }
  assert.deepEqual(missing, [], missing.join('\n'));
});

test('search typeahead follows the ARIA combobox pattern', () => {
  const src = read('components/SearchBox.js');
  assert.match(src, /role="combobox"/);
  assert.match(src, /aria-expanded=/);
  assert.match(src, /aria-controls="search-suggest"/);
  assert.match(src, /aria-autocomplete="list"/);
  // Arrow-key highlight must be announced: needs activedescendant + stable option ids.
  assert.match(src, /aria-activedescendant=/);
  assert.match(src, /id=\{`suggest-opt-\$\{i\}`\}/);
  assert.match(src, /role="option"/);
  assert.match(src, /aria-selected=/);
  // A listbox may only contain options, so the empty state must not claim that role.
  assert.match(src, /role=\{hasAny \? 'listbox' : 'status'\}/);
});
