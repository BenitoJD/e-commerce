const test = require('node:test');
const assert = require('node:assert/strict');
const { sitemapOrigin } = require('../sitemapOrigin');

test('FRONTEND_URL wins and the first value of an allowlist is used', () => {
  assert.equal(
    sitemapOrigin({ headers: { host: 'internal:9000' } }, { FRONTEND_URL: 'https://shop.test' }),
    'https://shop.test'
  );
  assert.equal(
    sitemapOrigin({}, { FRONTEND_URL: 'https://shop.test, https://www.shop.test/' }),
    'https://shop.test'
  );
  assert.equal(sitemapOrigin({}, { STOREFRONT_URL: 'https://alt.test' }), 'https://alt.test');
});

test('without configuration the request origin is used, never example.com', () => {
  const req = { headers: { host: 'localhost:3000' }, protocol: 'http' };
  assert.equal(sitemapOrigin(req, {}), 'http://localhost:3000');

  const proxied = {
    headers: { host: 'backend:9000', 'x-forwarded-host': 'shop.test', 'x-forwarded-proto': 'https' },
    protocol: 'http',
  };
  assert.equal(sitemapOrigin(proxied, {}), 'https://shop.test', 'proxy headers take precedence');
});

test('a relative or junk FRONTEND_URL is ignored in favour of the request host', () => {
  const req = { headers: { host: 'shop.test' }, protocol: 'https' };
  assert.equal(sitemapOrigin(req, { FRONTEND_URL: '/api' }), 'https://shop.test');
  assert.equal(sitemapOrigin(req, { FRONTEND_URL: 'not a url' }), 'https://shop.test');
});

test('the last resort stays a valid absolute URL', () => {
  assert.equal(sitemapOrigin({ headers: {} }, {}), 'https://www.example.com');
});
