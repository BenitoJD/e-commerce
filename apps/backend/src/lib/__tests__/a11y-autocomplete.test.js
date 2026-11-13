const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// WCAG 1.3.5 (Identify Input Purpose): fields collecting the user's own name, phone or
// email must declare their purpose so browsers and assistive tech can autofill them.
const STOREFRONT = path.resolve(__dirname, '..', '..', '..', '..', '..', 'apps', 'storefront');
const read = (rel) => fs.readFileSync(path.join(STOREFRONT, rel), 'utf8');

test('checkout declares autocomplete purposes and required fields', () => {
  const src = read('app/checkout/page.js');
  for (const token of ['autoComplete="name"', 'autoComplete="tel"', 'autoComplete="street-address"', 'autoComplete="postal-code"']) {
    assert.ok(src.includes(token), `checkout missing ${token}`);
  }
  // The four mandatory delivery fields must also be required for native validation.
  const requiredCount = (src.match(/required\s*\/?>/g) || []).length;
  assert.ok(requiredCount >= 4, `expected >=4 required checkout fields, found ${requiredCount}`);
});

test('contact and bulk-quote forms declare name/tel purposes', () => {
  for (const file of ['app/contact-us/page.js', 'app/bulk-quote/page.js']) {
    const src = read(file);
    assert.ok(src.includes('autoComplete="name"'), `${file} missing autoComplete="name"`);
    assert.ok(src.includes('autoComplete="tel"'), `${file} missing autoComplete="tel"`);
  }
});

test('lookup and alert forms declare their purpose', () => {
  for (const file of ['app/returns/page.js', 'app/track-order/page.js', 'app/my-orders/page.js']) {
    assert.ok(read(file).includes('autoComplete="tel"'), `${file} missing autoComplete="tel"`);
  }
  assert.ok(read('components/ProductView.js').includes('autoComplete="email"'), 'stock-alert email needs autoComplete="email"');
});
