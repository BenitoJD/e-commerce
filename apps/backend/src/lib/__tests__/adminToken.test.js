const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The admin console and every admin sub-page must share one token key AND one storage.
// A page that invents its own key (or reads localStorage while the console writes
// sessionStorage) silently behaves as "logged out" — exactly the bug this guards against.
const STOREFRONT = path.resolve(__dirname, '..', '..', '..', '..', '..', 'apps', 'storefront');
const ADMIN_PAGES = [
  'app/admin/page.js',
  'app/admin/picking/page.js',
];

test('admin pages use the shared token helper, not their own keys', () => {
  for (const rel of ADMIN_PAGES) {
    const src = fs.readFileSync(path.join(STOREFRONT, rel), 'utf8');
    assert.match(src, /from '\.\.\/\.\.\/lib\/adminToken'|from '\.\.\/\.\.\/\.\.\/lib\/adminToken'/, `${rel} must import the adminToken helper`);
    assert.doesNotMatch(src, /sessionStorage\.(get|set|remove)Item\(\s*'tk_admin'/, `${rel} still touches the key directly`);
    assert.doesNotMatch(src, /localStorage\.getItem\(\s*'t[wk]_admin/, `${rel} must not read its own key name`);
  }
});

test('the helper centralises the key and uses sessionStorage consistently', () => {
  const src = fs.readFileSync(path.join(STOREFRONT, 'lib', 'adminToken.js'), 'utf8');
  assert.match(src, /const KEY = 'tk_admin'/, 'key must be defined once');
  assert.match(src, /sessionStorage/, 'console persists the token in sessionStorage');
  for (const fn of ['getAdminToken', 'setAdminToken', 'clearAdminToken']) {
    assert.match(src, new RegExp(`export function ${fn}`), `missing ${fn}`);
  }
});
