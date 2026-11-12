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

// ---------------- wishlist ----------------

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

test('store: phone display is formatted +91 XXXXX XXXXX', () => {
  assert.match(storeLib.STORE.phoneDisplay, /^\+91 \d{5} \d{5}$/);
});
