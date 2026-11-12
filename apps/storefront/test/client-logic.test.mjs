// Client-side logic tests (cart, wishlist, store config).
// Runs under node --test with a stubbed browser environment; no bundler needed.
import test from 'node:test';
import assert from 'node:assert/strict';

// --- browser stubs (must exist before importing the libs) ---
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.window = { dispatchEvent: () => {} };

const cart = await import('../lib/cart.js');
const wishlist = await import('../lib/wishlist.js');
const storeLib = await import('../lib/store.js');
const api = await import('../lib/api.js');
const catalog = await import('../lib/catalog.js');

const SAMPLE = [
  { slug: 'a', name: 'Bosch Impact Drill', brand: 'Bosch', price: 5495, mrp: 6995 },
  { slug: 'b', name: 'Makita Angle Grinder', brand: 'Makita', price: 6899, mrp: 8250 },
  { slug: 'c', name: 'Bosch Tile Cutter', brand: 'Bosch', price: 7895, mrp: 9200 },
  { slug: 'd', name: 'Cheap Spanner', brand: 'Generic', price: 299, mrp: 299 },
];

function reset() {
  store.clear();
}

// ---------------- cart ----------------

test('cart: add, merge quantity, and total', () => {
  reset();
  cart.addToCart({ slug: 'a', name: 'A', price: 100 }, 1);
  cart.addToCart({ slug: 'a', name: 'A', price: 100 }, 2);
  cart.addToCart({ slug: 'b', name: 'B', price: 50 }, 1);
  const items = cart.getCart();
  assert.equal(items.length, 2);
  assert.equal(items.find((i) => i.slug === 'a').qty, 3);
  assert.equal(cart.cartTotal(items), 350);
});

test('cart: quantity is clamped to 99', () => {
  reset();
  cart.addToCart({ slug: 'a', name: 'A', price: 10 }, 500);
  assert.equal(cart.getCart()[0].qty, 99);
});

test('cart: updateQty 0 removes the line', () => {
  reset();
  cart.addToCart({ slug: 'a', name: 'A', price: 10 }, 2);
  assert.equal(cart.updateQty('a', 0).length, 0);
});

test('cart: corrupt/legacy entries self-heal instead of producing NaN', () => {
  reset();
  store.set('toolskart_cart', JSON.stringify([
    { slug: 'ok', name: 'OK', price: 100, qty: 2 },
    { name: 'no-slug', price: 50, qty: 1 },
    { slug: 'bad-price', name: 'Bad', price: 'junk', qty: 1 },
    null,
  ]));
  const items = cart.getCart();
  assert.equal(items.length, 2); // corrupt rows dropped
  assert.equal(items.find((i) => i.slug === 'bad-price').price, 0);
  assert.equal(cart.cartTotal(items), 200); // NaN never leaks into the total
});

test('cart: malformed JSON does not throw', () => {
  reset();
  store.set('toolskart_cart', 'not-json{{{');
  assert.deepEqual(cart.getCart(), []);
  assert.equal(cart.cartTotal([]), 0);
});

test('cart: non-array payload is rejected', () => {
  reset();
  store.set('toolskart_cart', JSON.stringify({ slug: 'x' }));
  assert.deepEqual(cart.getCart(), []);
});

test('cart: addToCart without a slug is a no-op', () => {
  reset();
  cart.addToCart({ name: 'No id', price: 10 }, 1);
  assert.equal(cart.getCart().length, 0);
});

test('cart: stock status flags sold-out and over-quantity lines', () => {
  const items = [
    { slug: 'a', qty: 2 },
    { slug: 'b', qty: 5 },
    { slug: 'c', qty: 1 },
    { slug: 'unknown', qty: 3 },
  ];
  const status = cart.cartStockStatus(items, {
    a: { stock: 10 },
    b: { stock: 2 },
    c: { stock: 0 },
  });
  assert.equal(status.ok, false);
  assert.deepEqual(status.unavailable, ['c']);
  assert.deepEqual(status.overQty, [{ slug: 'b', available: 2 }]);
  // a line the API doesn't know about must not block checkout
  assert.equal(status.unavailable.includes('unknown'), false);
});

test('cart: stock status is ok with enough stock or missing data', () => {
  assert.equal(cart.cartStockStatus([{ slug: 'a', qty: 1 }], { a: { stock: 3 } }).ok, true);
  assert.equal(cart.cartStockStatus([{ slug: 'a', qty: 1 }], {}).ok, true);
  assert.equal(cart.cartStockStatus([], null).ok, true);
  assert.equal(cart.cartStockStatus([{ slug: 'a', qty: 2 }], { a: { stock: '2' } }).ok, true);
});

test('cart: reorder mapping handles rupees, paise, qty clamps and junk', () => {
  const lines = cart.orderItemsToCartLines([
    { slug: 'a', name: 'Drill', price: 3499, qty: 2 },
    { slug: 'b', name: 'Motor', unit_price_paise: 2499900, qty: 0 }, // paise + bad qty
    { name: 'no slug' },
    null,
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].price, 3499);
  assert.equal(lines[0].qty, 2);
  assert.equal(lines[1].price, 24999); // paise → rupees
  assert.equal(lines[1].qty, 1); // clamped to at least 1
  assert.deepEqual(cart.orderItemsToCartLines(null), []);
});

test('cart: reorder lines flow into a real cart total', () => {
  reset();
  const lines = cart.orderItemsToCartLines([
    { slug: 'a', name: 'Drill', price: 100, qty: 2 },
    { slug: 'b', name: 'Bit set', price: 50, qty: 1 },
  ]);
  lines.forEach((l) => cart.addToCart(l, l.qty));
  assert.equal(cart.cartTotal(), 250);
});

// ---------------- catalog filtering ----------------

test('catalog: brand filter, "All" passthrough, missing input tolerated', () => {
  assert.equal(catalog.filterProducts(SAMPLE, { brand: 'Bosch' }).length, 2);
  assert.equal(catalog.filterProducts(SAMPLE, { brand: 'All' }).length, 4);
  assert.deepEqual(catalog.filterProducts(null), []);
  assert.deepEqual(catalog.filterProducts(undefined, null), []);
});

test('catalog: text search is case-insensitive on name', () => {
  const r = catalog.filterProducts(SAMPLE, { q: 'bosch' });
  assert.equal(r.length, 2);
  assert.ok(r.every((p) => p.brand === 'Bosch'));
  assert.equal(catalog.filterProducts(SAMPLE, { q: '  grinder ' }).length, 1);
});

test('catalog: price band respects both bounds and ignores blanks', () => {
  assert.equal(catalog.filterProducts(SAMPLE, { priceMin: '5000' }).length, 3);
  assert.equal(catalog.filterProducts(SAMPLE, { priceMax: '5500' }).length, 2); // 5495, 299
  assert.equal(catalog.filterProducts(SAMPLE, { priceMin: '1000', priceMax: '7000' }).length, 2); // 5495, 6899
  // blanks must not filter anything out
  assert.equal(catalog.filterProducts(SAMPLE, { priceMin: '', priceMax: '' }).length, 4);
  // non-numeric input is ignored rather than hiding everything
  assert.equal(catalog.filterProducts(SAMPLE, { priceMin: 'abc' }).length, 4);
});

test('catalog: sorts by price and by discount', () => {
  assert.deepEqual(catalog.filterProducts(SAMPLE, { sort: 'low' }).map((p) => p.slug), ['d', 'a', 'b', 'c']);
  assert.deepEqual(catalog.filterProducts(SAMPLE, { sort: 'high' }).map((p) => p.slug), ['c', 'b', 'a', 'd']);
  // no-discount item sinks to the bottom of the discount sort
  assert.equal(catalog.filterProducts(SAMPLE, { sort: 'off' }).slice(-1)[0].slug, 'd');
});

test('catalog: filtering does not mutate the source array order', () => {
  const before = SAMPLE.map((p) => p.slug).join(',');
  catalog.filterProducts(SAMPLE, { sort: 'low' });
  assert.equal(SAMPLE.map((p) => p.slug).join(','), before);
});

test('wishlist: add, dedupe, remove, clear', () => {
  reset();
  wishlist.addToWishlist({ slug: 'a', name: 'A', price: 10, stock: 4 });
  wishlist.addToWishlist({ slug: 'a', name: 'A', price: 10, stock: 4 });
  assert.equal(wishlist.getWishlist().length, 1);
  assert.equal(wishlist.isWishlisted('a'), true);
  wishlist.removeFromWishlist('a');
  assert.equal(wishlist.isWishlisted('a'), false);
  wishlist.addToWishlist({ slug: 'b', name: 'B', price: 1 });
  wishlist.clearWishlist();
  assert.equal(wishlist.getWishlist().length, 0);
});

test('wishlist: preserves stock so listing can show availability', () => {
  reset();
  wishlist.addToWishlist({ slug: 'out', name: 'Out', price: 10, stock: 0 });
  assert.equal(wishlist.getWishlist()[0].stock, 0);
});

test('wishlist: corrupt entries are dropped and prices coerced', () => {
  reset();
  store.set('tw_wishlist', JSON.stringify([
    { slug: 'a', name: 'A', price: 100 },
    { name: 'no-slug' },
    { slug: 'b', name: 'B', price: 'oops' },
  ]));
  const list = wishlist.getWishlist();
  assert.equal(list.length, 2);
  assert.equal(list.find((i) => i.slug === 'b').price, 0);
});

// ---------------- store config ----------------

test('store: contact details come from one config with safe defaults', () => {
  assert.equal(typeof storeLib.STORE.name, 'string');
  assert.ok(storeLib.STORE.name.length > 0);
  assert.match(storeLib.STORE.email, /@/);
  assert.match(storeLib.STORE.gstin, /^[0-9A-Z]{15}$/);
  assert.match(storeLib.STORE.phoneDigits, /^\d{10,13}$/);
});

test('store: waLink builds a valid wa.me URL with optional text', () => {
  const plain = storeLib.waLink();
  assert.match(plain, /^https:\/\/wa\.me\/\d+$/);
  const withText = storeLib.waLink('hello world & more');
  assert.ok(withText.startsWith(plain + '?text='));
  assert.ok(!withText.includes(' ')); // encoded
  assert.ok(withText.includes('%26')); // ampersand encoded
});

test('store: waLinkTo normalises Indian numbers for customer chats', () => {
  assert.equal(storeLib.waLinkTo('9876543210'), 'https://wa.me/919876543210');
  assert.equal(storeLib.waLinkTo('+91 98765 43210'), 'https://wa.me/919876543210');
  assert.equal(storeLib.waLinkTo('098765 43210'), 'https://wa.me/919876543210');
  assert.equal(storeLib.waLinkTo('919876543210'), 'https://wa.me/919876543210');
  assert.equal(storeLib.waLinkTo('98765-43210', 'hi there'), 'https://wa.me/919876543210?text=hi%20there');
  // nothing usable -> no link (so the UI can hide the button)
  assert.equal(storeLib.waLinkTo(''), null);
  assert.equal(storeLib.waLinkTo(null), null);
  assert.equal(storeLib.waLinkTo('12345'), null);
});

test('store: phone display is formatted +91 XXXXX XXXXX', () => {
  assert.match(storeLib.STORE.phoneDisplay, /^\+91 \d{5} \d{5}$/);
});

// ---------------- api: product normalisation ----------------

test('api: paise are converted to rupees exactly once', () => {
  const p = api.normalizeProduct({ slug: 'a', price_paise: 549500, mrp_paise: 699500, images: ['/x.jpg'] });
  assert.equal(p.price, 5495);
  assert.equal(p.mrp, 6995);
  assert.equal(p.image, '/x.jpg');
  assert.equal(p.id, 'a');
});

test('api: already-rupee shapes are left untouched', () => {
  const p = api.normalizeProduct({ slug: 'b', price: 3499, mrp: 4995 });
  assert.equal(p.price, 3499);
  assert.equal(p.mrp, 4995);
});

test('api: normalisation never mutates the source object', () => {
  const src = { slug: 'c', price_paise: 100 };
  api.normalizeProduct(src);
  assert.equal(src.price, undefined);
});

test('api: free/zero-price products keep their zero', () => {
  const p = api.normalizeProduct({ slug: 'd', price_paise: 0 });
  assert.equal(p.price, 0);
});

test('api: garbage input is returned as-is, not thrown on', () => {
  assert.equal(api.normalizeProduct(null), null);
  assert.deepEqual(api.normalizeList(null), []);
  assert.deepEqual(api.normalizeList([{ slug: 'e', price_paise: 1000 }])[0].price, 10);
});

// ---------------- api: readable error messages ----------------

test('api: backend error field is surfaced verbatim', () => {
  const msg = api.parseErrorMessage(400, JSON.stringify({ error: 'Insufficient stock for motor-b' }));
  assert.equal(msg, 'Insufficient stock for motor-b');
});

test('api: plain-text bodies are trimmed, HTML/JSON dumps are not shown', () => {
  assert.equal(api.parseErrorMessage(500, '  Service unavailable  '), 'Service unavailable');
  assert.ok(!api.parseErrorMessage(500, '<html><body>boom</body></html>').includes('<html>'));
  assert.ok(!api.parseErrorMessage(500, '{"weird":true}').includes('{'));
});

test('api: friendly fallbacks by status when no body is usable', () => {
  assert.match(api.parseErrorMessage(401, ''), /not authorised/i);
  assert.match(api.parseErrorMessage(404, ''), /not found/i);
  assert.match(api.parseErrorMessage(429, ''), /too many/i);
  assert.match(api.parseErrorMessage(503, ''), /our side/i);
  assert.match(api.parseErrorMessage(418, ''), /418/);
});

// ---------------- api: video embed safety ----------------

test('api: localhost base on a public host is flagged as a misconfiguration', () => {
  const f = api.detectMisconfiguredBase;
  assert.match(f('http://localhost:9000', 'shop.example.com'), /localhost/);
  assert.match(f('http://127.0.0.1:9000', 'shop.example.com'), /localhost/);
  // dev is fine
  assert.equal(f('http://localhost:9000', 'localhost'), null);
  assert.equal(f('http://localhost:9000', '127.0.0.1'), null);
  // production-style values are fine
  assert.equal(f('https://shop.example.com/api', 'shop.example.com'), null);
  assert.equal(f('/api', 'shop.example.com'), null);
});

test('api: only known embed hosts pass video validation', () => {
  const ok = api.safeVideoUrls([
    'https://www.youtube.com/embed/abc123',
    'https://youtube-nocookie.com/embed/x',
    'https://vimeo.com/12345',
  ]);
  assert.equal(ok.length, 3);
});

test('api: javascript/data/malformed URLs are stripped (iframe injection guard)', () => {
  const bad = api.safeVideoUrls([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://youtube.com/embed/abc',
    'https://evil.com/embed/abc',
    null,
    '',
  ]);
  assert.deepEqual(bad, []);
  assert.deepEqual(api.safeVideoUrls(undefined), []);
  assert.deepEqual(api.safeVideoUrls('not-an-array'), []);
});
