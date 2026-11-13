// Shared helpers for the browser suite.
const { expect } = require('@playwright/test');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const API = process.env.API_URL || 'http://localhost:9000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-admin-token-please-change-123456';

// Product slugs used by the suite (all exist in apps/backend/data/products.js).
const P = {
  grinder: 'bosch-gws-600-grinder', // ₹3,499
  drill: 'dewalt-dwd024-drill',
  router: 'makita-m3600-router',
  washer: 'karcher-hd5-pressure-washer', // ₹27,999 — above the COD cap
  scrubber: 'roots-scrubber-e50', // ₹1,49,999 — above the COD cap
};

let seq = 0;

// A fresh, valid Indian mobile number per call so order lookups never collide.
function uniquePhone() {
  seq += 1;
  const tail = String(Date.now()).slice(-6) + String(seq).padStart(2, '0');
  return `9${tail}`.slice(0, 10).padEnd(10, '0');
}

function uniqueEmail(prefix = 'buyer') {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@example.com`;
}

// Collects console errors and uncaught page errors. Third-party ad/analytics noise does not
// exist here, so any entry is a genuine defect worth failing on.
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('requestfailed', (r) => {
    // Ignore requests aborted by navigation.
    if (r.failure() && r.failure().errorText !== 'net::ERR_ABORTED') {
      errors.push(`requestfailed: ${r.url()} ${r.failure().errorText}`);
    }
  });
  return errors;
}

async function addToCart(page, slug = P.grinder, qty = 1) {
  await page.goto(`/product/${slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Qty stepper starts at 1; click + (qty-1) times.
  for (let i = 1; i < qty; i += 1) {
    await page.getByRole('button', { name: '+', exact: true }).click();
  }
  await page.getByRole('button', { name: /^Add to Cart$/ }).click();
  await expect(page.getByRole('button', { name: /Added/ })).toBeVisible();
}

async function clearCartState(page) {
  // Clear once, on a real navigation. addInitScript would run on EVERY document load and
  // wipe the cart the moment the test navigates to /cart.
  await page.goto('/');
  await page.evaluate(() => {
    try {
      localStorage.removeItem('tw_cart');
      localStorage.removeItem('tw_coupon');
      localStorage.removeItem('tw_wishlist');
      localStorage.removeItem('tw_compare');
      localStorage.removeItem('tw_recent');
      localStorage.removeItem('tw_phone');
    } catch { /* ignore */ }
  });
}

async function fillAddress(page, { phone, name = 'E2E Buyer', email = null, address = '12 Industrial Estate, Peenya', pincode = '560058', state = 'Karnataka', gstin = '', notes = '' } = {}) {
  // The state list is fetched after mount. Interacting with it first proves hydration is
  // done, so the controlled inputs below cannot be reset by the hydration pass.
  await page.getByLabel('Delivery state').locator('option').nth(1).waitFor({ state: 'attached' });
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Phone number').fill(phone);
  await page.getByLabel('Email for order updates').fill(email || `${phone}@example.com`);
  await page.getByLabel('Delivery address').fill(address);
  await page.getByLabel('Pincode').fill(pincode);
  await page.getByLabel('Delivery state').selectOption({ label: state });
  if (gstin) await page.getByLabel('GSTIN for business invoice').fill(gstin);
  if (notes) await page.getByLabel('Order notes').fill(notes);
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'x-admin-token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

async function createCodOrder({ phone, slug = P.grinder, qty = 1, name = 'E2E Buyer', notes = '' } = {}) {
  const r = await api('/store/checkout/create', {
    method: 'POST',
    body: {
      items: [{ slug, qty }],
      customer: { name, phone, address: '12 Industrial Estate, Peenya', pincode: '560058', stateCode: '29' },
      payMode: 'cod',
      ...(notes ? { notes } : {}),
    },
  });
  if (r.status !== 200) throw new Error(`create order failed: ${r.status} ${r.text}`);
  return r.json;
}

async function adminLogin(page) {
  await page.goto('/admin');
  await page.getByLabel('Admin token').fill(ADMIN_TOKEN);
  await page.getByRole('button', { name: /Save & Connect/i }).click();
  await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible();
}

module.exports = {
  P,
  BASE,
  API,
  ADMIN_TOKEN,
  uniquePhone,
  uniqueEmail,
  watchErrors,
  addToCart,
  clearCartState,
  fillAddress,
  api,
  createCodOrder,
  adminLogin,
};
