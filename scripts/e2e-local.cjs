// End-to-end rehearsal against a running stack: storefront + API + Postgres.
//
//   API_URL=http://127.0.0.1:9000 BASE_URL=http://localhost:3000 \
//   ADMIN_TOKEN=<token> RAZORPAY_WEBHOOK_SECRET=<secret> node scripts/e2e-local.cjs
//
// Exercises the real customer and operator journeys (brand, catalogue, COD order with coupon,
// stock reservation, invoice maths + brand, tracking, phone scoping, admin state machine,
// returns window, cancellation, signed webhook, quotes, reviews, admin surfaces, 404s, SEO).
// Exits non-zero on the first failure, so it can gate a deploy.
const crypto = require('crypto');
const path = require('path');

const BACK = process.env.API_URL || 'http://127.0.0.1:9000';
const SHOP = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'local-admin-token-123456';
const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'local_whsec_test_123';
const PRODUCT = process.env.PRODUCT_SLUG || 'bosch-gws-600-grinder';
const STORE_NAME = process.env.STORE_NAME || 'E-Commerce';
const ADMIN = { 'x-admin-token': ADMIN_TOKEN };

// Expected sitemap size derived from the same data the backend uses, not a magic number.
const ROOT = path.resolve(__dirname, '..');
const { STATIC_PAGES } = require(path.join(ROOT, 'apps', 'backend', 'data', 'sitePages.js'));
const productsMod = require(path.join(ROOT, 'apps', 'backend', 'data', 'products.js'));
const PRODUCTS = Array.isArray(productsMod) ? productsMod : productsMod.products;
const BRANDS = [...new Set(PRODUCTS.map((p) => p.brand).filter(Boolean))];
const EXPECTED_SITEMAP_URLS = 1 + STATIC_PAGES.length + PRODUCTS.length + BRANDS.length;

let failures = 0;
function ok(cond, label, extra) {
  if (!cond) failures += 1;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra === undefined ? '' : `  -> ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`}`);
}
async function j(method, path, body, headers = {}, base = BACK) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}
function sign(raw) { return crypto.createHmac('sha256', SECRET).update(raw).digest('hex'); }

(async () => {
  // ---- brand & catalogue
  const home = await fetch(SHOP + '/');
  const homeHtml = (await home.text()).replace(/<!-- -->/g, '');
  ok(home.status === 200, 'home renders', home.status);
  ok(homeHtml.includes(STORE_NAME), `brand is ${STORE_NAME}`);
  ok(!homeHtml.includes('ToolsKart') && !/clone/i.test(homeHtml), 'old brand/clone wording is gone from the UI');
  ok(!homeHtml.includes('NaN'), 'no ₹NaN on the home page');

  const products = await j('GET', '/store/products?limit=100');
  ok(products.json.total === PRODUCTS.length, `catalogue seeded with ${PRODUCTS.length} products`, products.json.total);

  // ---- COD order lifecycle
  const before = await j('GET', `/store/products/${PRODUCT}`);
  const stock0 = before.json.product.stock;
  const created = await j('POST', '/store/checkout/create', {
    items: [{ slug: PRODUCT, qty: 1 }],
    customer: { name: 'E2E Buyer', phone: '9812301111', address: '12 Industrial Estate', pincode: '560058', stateCode: '29' },
    payMode: 'cod', couponCode: 'WELCOME10',
  });
  ok(created.status === 200, 'COD checkout with coupon succeeds', created.status);
  const { receipt, orderId, amount_paise: amount, discount_paise: discount } = created.json;
  ok(discount > 0 && amount < 899900, 'coupon discount applied', { discount, amount });

  const after = await j('GET', `/store/products/${PRODUCT}`);
  ok(after.json.product.stock === stock0 - 1, 'stock reserved', after.json.product.stock);

  const invoiceJson = await j('GET', `/store/invoice/${receipt}`);
  ok(invoiceJson.status === 200, 'invoice JSON available');
  ok(invoiceJson.json.gst.base + invoiceJson.json.gst.gst === invoiceJson.json.grandPaise, 'invoice maths reconciles');
  ok(invoiceJson.json.customer.stateCode === '29', 'place of supply stored');

  const invoicePage = await fetch(`${SHOP}/invoice/${receipt}`);
  const invoiceHtml = (await invoicePage.text()).replace(/<!-- -->/g, '');
  ok(invoicePage.status === 200, 'invoice page renders');
  ok(invoiceHtml.includes(STORE_NAME), 'invoice carries the store brand');
  ok(/IGST/.test(invoiceHtml) && !/CGST/.test(invoiceHtml), 'inter-state invoice uses IGST');
  ok(!/clone/i.test(invoiceHtml), 'invoice has no clone wording');

  // ---- track / wrong phone / returns before delivery
  const track = await j('GET', `/store/service/track?receipt=${receipt}&phone=9812301111`);
  ok(track.status === 200 && track.json.status === 'cod_pending', 'tracking works', track.json && track.json.status);
  const wrong = await j('GET', `/store/service/track?receipt=${receipt}&phone=9999999999`);
  ok(wrong.status === 401, 'wrong phone is rejected (401)', wrong.status);
  const preReturn = await j('GET', `/store/service/returns/eligibility?receipt=${receipt}&phone=9812301111`);
  ok(preReturn.json.eligible === false, 'returns blocked before delivery');

  // ---- admin: shipped -> delivered (state machine enforced)
  const skip = await j('PATCH', `/admin/orders/${orderId}`, { status: 'delivered' }, ADMIN);
  ok(skip.status === 409, 'skipping shipped is refused', skip.status);
  const shipped = await j('PATCH', `/admin/orders/${orderId}`, { status: 'shipped' }, ADMIN);
  ok(shipped.status === 200, 'marked shipped', shipped.status);
  const delivered = await j('PATCH', `/admin/orders/${orderId}`, { status: 'delivered' }, ADMIN);
  ok(delivered.status === 200, 'marked delivered', delivered.status);

  // ---- returns after delivery, then cancellation of a separate order
  const eligible = await j('GET', `/store/service/returns/eligibility?receipt=${receipt}&phone=9812301111`);
  ok(eligible.json.eligible === true && eligible.json.windowDays === 7, 'return window is 7 days', eligible.json);
  const rma = await j('POST', '/store/service/returns', { receipt, phone: '9812301111', reason: 'damaged', details: 'Cracked housing' });
  ok([200, 201].includes(rma.status), 'RMA created', rma.status);
  const rma2 = await j('POST', '/store/service/returns', { receipt, phone: '9812301111', reason: 'other' });
  ok(rma2.status === 409, 'second open RMA refused', rma2.status);
  const rmas = await j('GET', '/admin/returns', undefined, ADMIN);
  ok(rmas.status === 200 && rmas.json.returns.length >= 1, 'RMA visible in admin');

  const cancellable = await j('POST', '/store/checkout/create', {
    items: [{ slug: PRODUCT, qty: 1 }],
    customer: { name: 'Cancel Buyer', phone: '9812302222', address: '1 Test Rd', pincode: '560001', stateCode: '27' },
    payMode: 'cod',
  });
  const cancel = await j('POST', '/store/service/cancel', { receipt: cancellable.json.receipt, phone: '9812302222' });
  ok(cancel.status === 200 && cancel.json.status === 'cancelled', 'cancellation works', cancel.json && cancel.json.status);
  const restored = await j('GET', `/store/products/${PRODUCT}`);
  ok(restored.json.product.stock === stock0 - 1, 'cancelled order released its stock', restored.json.product.stock);

  // ---- online order + signed webhook
  const online = await j('POST', '/store/checkout/create', {
    items: [{ slug: PRODUCT, qty: 1 }],
    customer: { name: 'Webhook Buyer', phone: '9812303333', address: '2 Test Rd', pincode: '560001', stateCode: '27' },
    payMode: 'online',
  });
  const rzpOrder = online.json.razorpayOrderId;
  const payload = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { order_id: rzpOrder, id: 'pay_e2e_1', amount: online.json.amount_paise } } } });
  const forged = await fetch(`${BACK}/webhooks/razorpay`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'bad' }, body: payload });
  ok(forged.status === 400, 'forged webhook rejected', forged.status);
  const signed = await fetch(`${BACK}/webhooks/razorpay`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sign(payload) }, body: payload });
  ok(signed.status === 200, 'signed webhook accepted', signed.status);
  const paidState = await j('GET', `/store/checkout/verify?receipt=${online.json.receipt}`);
  ok(paidState.json.status === 'paid', 'order marked paid', paidState.json.status);

  // ---- quotes, reviews, engagement
  const quote = await j('POST', '/store/quotes', { name: 'Bulk Buyer', phone: '9812304444', product: 'grinder', qty: 20, message: 'Workshop order' });
  ok([200, 201].includes(quote.status), 'quote submitted', quote.status);
  const review = await j('POST', `/store/engage/reviews/${PRODUCT}`, { rating: 4, name: 'E2E Buyer', text: 'Solid grinder.' });
  ok([200, 201].includes(review.status), 'review accepted', review.status);
  const productPage = await fetch(`${SHOP}/product/${PRODUCT}`);
  const productHtml = (await productPage.text()).replace(/<!-- -->/g, '');
  ok(/aggregateRating/.test(productHtml), 'product JSON-LD includes aggregateRating');

  // ---- admin surfaces
  const stats = await j('GET', '/admin/stats', undefined, ADMIN);
  ok(stats.status === 200, 'admin stats', stats.status);
  const csv = await j('GET', '/admin/orders/export.csv', undefined, ADMIN);
  ok(csv.status === 200 && /taxable_value_inr,gst_inr,gst_rate/.test(csv.text), 'CSV export has GST columns');
  ok(csv.text.includes(receipt), 'CSV contains the order');
  const noToken = await j('GET', '/admin/stats');
  ok(noToken.status === 401, 'admin requires the token', noToken.status);
  const badId = await j('GET', '/admin/orders/not-a-number', undefined, ADMIN);
  ok(badId.status === 400, 'non-numeric admin id is a 400', badId.status);

  // ---- 404s and SEO surfaces
  for (const [label, path] of [
    ['unknown product', '/product/nope'], ['unknown category', '/category/nope'],
    ['unknown subcategory', '/category/pumps/nope'], ['unknown invoice', '/invoice/nope'],
  ]) {
    const r = await fetch(SHOP + path);
    ok(r.status === 404, `${label} is a real 404`, r.status);
  }
  const robots = await (await fetch(SHOP + '/robots.txt')).text();
  ok(/Sitemap:/i.test(robots) && /Disallow: \/admin/.test(robots), 'robots.txt wired');
  const sitemap = await (await fetch(SHOP + '/sitemap.xml')).text();
  const locs = (sitemap.match(/<loc>/g) || []).length;
  ok(locs === EXPECTED_SITEMAP_URLS, `sitemap lists ${EXPECTED_SITEMAP_URLS} URLs`, locs);
  ok(sitemap.includes(`${SHOP}/product/${PRODUCT}`), 'sitemap URLs use the request origin');

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('CRASH', e.message); process.exit(1); });
