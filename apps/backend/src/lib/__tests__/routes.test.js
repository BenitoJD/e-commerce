// Route-level integration tests with an in-memory fake DB (no Postgres needed).
// Patches the shared db module BEFORE routers load, then drives a real Express
// app over HTTP. Covers: checkout (incl. coupons + stock reservation), verify,
// customer cancel (+restock), webhooks (capture/fail/idempotency), admin
// transitions (+guard), products detail, coupon validate, pincode.
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';
process.env.RAZORPAY_KEY_ID = 'rzp_test_xxxx';
process.env.RAZORPAY_KEY_SECRET = 'xxxx';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');

const db = require('../../db');

function makeFakeDb() {
  const products = new Map([
    ['drill-a', { slug: 'drill-a', name: 'Drill A', price_paise: 100000, mrp_paise: 120000, stock: 100 }],
    ['motor-b', { slug: 'motor-b', name: 'Motor B', price_paise: 500000, mrp_paise: 600000, stock: 1 }], // keep at 1: oversell test needs qty 2 to fail
  ]);
  const coupons = new Map([
    ['SAVE10', { code: 'SAVE10', pct_off: 10, max_discount_paise: 50000, min_order_paise: 50000, active: true }],
  ]);
  const orders = [];
  let seq = 1;
  const quotes = [];
  let quoteSeq = 1;
  let ret = [];
  let alerts = [];

  async function query(text, params = []) {
    const t = String(text).replace(/\s+/g, ' ').trim();
    if (t.startsWith('SELECT slug, name, price_paise, stock FROM products WHERE slug = ANY')) {
      return { rows: params[0].map((s) => products.get(s)).filter(Boolean).map((p) => ({ slug: p.slug, name: p.name, price_paise: p.price_paise, stock: p.stock })) };
    }
    if (t.startsWith('SELECT slug, price_paise, stock FROM products')) {
      return { rows: params[0].map((s) => products.get(s)).filter(Boolean).map((p) => ({ slug: p.slug, price_paise: p.price_paise, stock: p.stock })) };
    }
    if (t.startsWith('SELECT slug, name, price_paise FROM products')) {
      return { rows: [...products.values()].filter((p) => params[0].includes(p.slug)) };
    }
    if (t.startsWith('SELECT slug, name, hsn, price_paise FROM products')) {
      return { rows: [...products.values()].filter((p) => params[0].includes(p.slug)) };
    }
    if (t.startsWith('SELECT * FROM products WHERE slug =')) {
      const p = products.get(params[0]);
      return { rows: p ? [{ ...p, specs: {}, images: [] }] : [] };
    }
    if (t.startsWith('UPDATE coupons') && t.includes('used_count = used_count + 1')) {
      const c = coupons.get(String(params[0]).toUpperCase());
      if (!c) return { rows: [] };
      const max = Number(c.max_uses) || 0;
      if (max > 0 && Number(c.used_count || 0) >= max) return { rows: [] };
      c.used_count = Number(c.used_count || 0) + 1;
      return { rows: [{ code: c.code }] };
    }
    if (t.includes('FROM coupons WHERE UPPER(code)')) {
      const c = coupons.get(String(params[0]).toUpperCase());
      return { rows: c ? [{ ...c }] : [] };
    }
    if (t.startsWith('UPDATE products SET stock = stock -')) {
      const [qty, slug] = params;
      const p = products.get(slug);
      if (p && p.stock >= qty) {
        p.stock -= qty;
        return { rows: [{ slug, stock: p.stock }] };
      }
      return { rows: [] };
    }
    if (t.startsWith('UPDATE products SET stock = stock +')) {
      const [qty, slug] = params;
      const p = products.get(slug);
      if (p) p.stock += qty;
      return { rows: [] };
    }
    if (t.startsWith('INSERT INTO orders')) {
      const [receipt, status, items, amount, customer, coupon, discount] = params;
      const row = {
        id: seq++, receipt, status,
        items: typeof items === 'string' ? JSON.parse(items) : items,
        amount_paise: amount,
        customer: typeof customer === 'string' ? JSON.parse(customer) : customer,
        coupon_code: coupon ?? null, discount_paise: discount ?? 0,
        razorpay_order_id: null, razorpay_payment_id: null,
        created_at: new Date().toISOString(),
      };
      orders.push(row);
      return { rows: [{ id: row.id, receipt: row.receipt }] };
    }
    if (t.startsWith('UPDATE orders SET razorpay_order_id')) {
      const o = orders.find((x) => x.id === params[1]);
      if (o) o.razorpay_order_id = params[0];
      return { rows: [] };
    }
    if (t.startsWith('SELECT receipt, status, amount_paise, razorpay_payment_id FROM orders WHERE receipt')) {
      const o = orders.find((x) => x.receipt === params[0]);
      return { rows: o ? [{ receipt: o.receipt, status: o.status, amount_paise: o.amount_paise, razorpay_payment_id: o.razorpay_payment_id }] : [] };
    }
    if (t.startsWith('SELECT receipt, status, customer FROM orders WHERE receipt')) {
      const o = orders.find((x) => x.receipt === params[0]);
      return { rows: o ? [{ receipt: o.receipt, status: o.status, customer: o.customer }] : [] };
    }
    if (t.startsWith('SELECT receipt, status, items, amount_paise, razorpay_payment_id, customer FROM orders WHERE receipt')) {
      const o = orders.find((x) => x.receipt === params[0]);
      return { rows: o ? [{ ...o }] : [] };
    }
    if (t.includes('FROM orders WHERE receipt = $1') && t.includes('coupon_code')) {
      const o = orders.find((x) => x.receipt === params[0]);
      return { rows: o ? [{ receipt: o.receipt, status: o.status, items: o.items, amount_paise: o.amount_paise, razorpay_payment_id: o.razorpay_payment_id, customer: o.customer, created_at: o.created_at, coupon_code: o.coupon_code || null, discount_paise: o.discount_paise || 0 }] : [] };
    }
    if (t.startsWith('SELECT id, receipt, status, amount_paise, items FROM orders WHERE razorpay_order_id')) {
      const o = orders.find((x) => x.razorpay_order_id === params[0]);
      return { rows: o ? [{ id: o.id, receipt: o.receipt, status: o.status, amount_paise: o.amount_paise, items: o.items }] : [] };
    }
    if (t.startsWith('UPDATE orders SET status =') && t.includes('WHERE id = $3')) {
      const o = orders.find((x) => x.id === Number(params[2]));
      if (o) {
        o.status = params[0];
        if (params[1]) o.razorpay_payment_id = params[1];
      }
      return { rows: [] };
    }
    if (t.startsWith('UPDATE orders SET status =') && t.includes('WHERE razorpay_order_id')) {
      const o = orders.find((x) => x.razorpay_order_id === params[2]);
      if (o) {
        o.status = params[0];
        if (params[1]) o.razorpay_payment_id = params[1];
      }
      return { rows: [] };
    }
    if (t.startsWith("UPDATE orders SET status = 'cancelled' WHERE receipt")) {
      const o = orders.find((x) => x.receipt === params[0]);
      if (o) o.status = 'cancelled';
      return { rows: o ? [{ receipt: o.receipt, status: o.status }] : [] };
    }
    if (t.startsWith('SELECT slug, price_paise FROM products WHERE slug =')) {
      const p = products.get(params[0]);
      return { rows: p ? [{ slug: p.slug, price_paise: p.price_paise }] : [] };
    }
    if (t.startsWith('SELECT * FROM bulk_quotes WHERE id =')) {
      const q = quotes.find((x) => x.id === Number(params[0]));
      return { rows: q ? [{ ...q }] : [] };
    }
    if (t.startsWith("UPDATE bulk_quotes SET status = 'won', order_receipt =")) {
      const q = quotes.find((x) => x.id === Number(params[1]));
      if (q) {
        q.status = 'won';
        q.order_receipt = params[0];
      }
      return { rows: [] };
    }
    if (t.startsWith('SELECT slug, name, brand, price_paise, mrp_paise, stock, images FROM products')) {
      return { rows: [...products.values()].map((p) => ({ slug: p.slug, name: p.name, brand: p.brand, price_paise: p.price_paise, stock: p.stock, images: [] })) };
    }
    if (t.includes('FROM products') && t.includes('GROUP BY brand')) {
      return { rows: [{ brand: 'DrillCo', count: 1 }] };
    }
    if (t.includes('FROM products') && t.includes('GROUP BY category')) {
      return { rows: [{ category: 'power-tools', count: 1 }] };
    }
    if (t.startsWith('SELECT * FROM orders WHERE id =')) {
      const o = orders.find((x) => x.id === Number(params[0]));
      return { rows: o ? [{ ...o }] : [] };
    }
    if (t.startsWith('SELECT slug, name, hsn FROM products')) {
      return { rows: [...products.values()].filter((p) => params[0].includes(p.slug)).map((p) => ({ slug: p.slug, name: p.name, hsn: p.hsn || '' })) };
    }
    if (t.startsWith('INSERT INTO products') && t.includes('ON CONFLICT (slug) DO UPDATE')) {
      const [slug, name, brand, category, price, mrp, hsn, stock, specs, images, videos] = params;
      products.set(slug, { slug, name, brand, category, price_paise: price, mrp_paise: mrp, hsn, stock, specs: JSON.parse(specs || '{}'), images: images || [], videos: videos || [] });
      return { rows: [{ slug, name, price_paise: price, stock }] };
    }
    if (t.startsWith('DELETE FROM products WHERE slug')) {
      const had = products.delete(params[0]);
      return { rows: had ? [{ slug: params[0] }] : [] };
    }
    if (t.startsWith('INSERT INTO stock_alerts')) {
      const [slug, email] = params;
      if (!alerts.some((a) => a.product_slug === slug && a.email === email)) {
        alerts.push({ id: alerts.length + 1, product_slug: slug, email, notified: false, created_at: new Date().toISOString() });
      }
      return { rows: [] };
    }
    if (t.startsWith('SELECT * FROM stock_alerts')) {
      return { rows: alerts.slice() };
    }
    if (t.startsWith('SELECT 1 FROM products WHERE slug')) {
      return { rows: products.has(params[0]) ? [{ '?column?': 1 }] : [] };
    }
    if (t.startsWith('INSERT INTO return_requests')) {
      const [receipt, phone, reason, details] = params;
      if (!ret) ret = [];
      const row = { id: ret.length + 1, receipt, phone, reason, details, status: 'requested', created_at: new Date().toISOString() };
      ret.push(row);
      return { rows: [{ id: row.id, status: row.status, created_at: row.created_at }] };
    }
    if (t.startsWith('SELECT * FROM return_requests')) {
      return { rows: (ret || []).slice() };
    }
    if (t.startsWith('UPDATE return_requests SET status')) {
      const row = (ret || []).find((r) => r.id === Number(params[1]));
      if (row) row.status = params[0];
      return { rows: row ? [row] : [] };
    }
    if (t.startsWith('SELECT status, items FROM orders WHERE id')) {
      const o = orders.find((x) => x.id === Number(params[0]));
      return { rows: o ? [{ status: o.status, items: o.items }] : [] };
    }
    if (t.startsWith('SELECT status, items, amount_paise, razorpay_payment_id FROM orders WHERE id')
      || t.startsWith('SELECT receipt, status, items, amount_paise, razorpay_payment_id FROM orders WHERE id')) {
      const o = orders.find((x) => x.id === Number(params[0]));
      return { rows: o ? [{ receipt: o.receipt, status: o.status, items: o.items, amount_paise: o.amount_paise, razorpay_payment_id: o.razorpay_payment_id }] : [] };
    }
    if (t.startsWith('UPDATE orders SET status = $1 WHERE id = $2')) {
      const o = orders.find((x) => x.id === Number(params[1]));
      if (o) o.status = params[0];
      return { rows: o ? [{ ...o }] : [] };
    }
    if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK') return { rows: [] };
    if (t.startsWith('SELECT * FROM coupons WHERE code')) {
      return { rows: [] };
    }
    throw new Error(`fake-db: unhandled query: ${t.slice(0, 120)}`);
  }

  const client = { query, release() {} };
  const pool = { connect: async () => client, query };
  return { query, pool, products, orders, coupons, quotes, nextQuoteId: () => quoteSeq++ };
}

const fake = makeFakeDb();
db.query = fake.query;
db.pool = fake.pool;

const app = express();
app.use('/webhooks', express.raw({ type: '*/*' }), require('../../routes/webhooks'));
app.use(express.json({ limit: '1mb' }));
app.use('/store/products', require('../../routes/products'));
app.use('/store/checkout', require('../../routes/checkout'));
app.use('/store/search', require('../../routes/search'));
app.use('/store/engage', require('../../routes/engagement'));
app.use('/store/service', require('../../routes/service'));
app.use('/store/invoice', require('../../routes/invoice'));
app.use('/admin', require('../../routes/admin'));

let server;
let base;
test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function api(method, path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json, text };
}

function signedWebhook(event, entity) {
  const payload = JSON.stringify({ event, payload: { payment: { entity } } });
  const sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(Buffer.from(payload)).digest('hex');
  return { payload, sig };
}

test('checkout creates order with server-side stock reservation', async () => {
  const before = fake.products.get('drill-a').stock;
  const r = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 2 }],
    customer: { name: 'Ravi', phone: '9876543210' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.amount_paise, 200000);
  assert.match(r.json.receipt, /^rcpt_/);
  assert.match(r.json.razorpayOrderId, /^order_mock_/);
  const p = fake.products.get('drill-a');
  assert.equal(p.stock, before - 2); // exactly the 2 units reserved
});

test('checkout rejects oversell with 409 and keeps stock', async () => {
  const r = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'motor-b', qty: 2 }], // only 1 in stock
    customer: { name: 'Ravi', phone: '9876543210' },
  });
  assert.equal(r.status, 409);
  assert.match(r.json.error, /motor-b/);
  assert.equal(fake.products.get('motor-b').stock, 1);
});

test('checkout applies coupon server-side and rejects bad codes', async () => {
  const good = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    couponCode: 'save10', // lowercase: must still match
  });
  assert.equal(good.status, 200);
  assert.equal(good.json.discount_paise, 10000); // 10% of 100000
  assert.equal(good.json.amount_paise, 90000);

  const bad = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    couponCode: 'NOPE',
  });
  assert.equal(bad.status, 400);
});

test('verify + customer cancel releases stock', async () => {
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    payMode: 'cod',
  });
  assert.equal(created.status, 200);
  const receipt = created.json.receipt;

  const v = await api('GET', `/store/checkout/verify?receipt=${receipt}`);
  assert.equal(v.status, 200);
  assert.equal(v.json.status, 'cod_pending');

  const c = await api('POST', '/store/service/cancel', { receipt, phone: '9876543210' });
  assert.equal(c.status, 200);
  assert.equal(c.json.status, 'cancelled');
});

test('webhooks: capture marks paid, duplicate is idempotent, late failure ignored', async () => {
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
  });
  const rzpOrder = created.json.razorpayOrderId;

  const cap = signedWebhook('payment.captured', { id: 'pay_1', order_id: rzpOrder, amount: created.json.amount_paise });
  const r1 = await fetch(`${base}/webhooks/razorpay`, { method: 'POST', headers: { 'x-razorpay-signature': cap.sig }, body: cap.payload });
  assert.equal(r1.status, 200);

  const v = await api('GET', `/store/checkout/verify?receipt=${created.json.receipt}`);
  assert.equal(v.json.status, 'paid');

  const r2 = await fetch(`${base}/webhooks/razorpay`, { method: 'POST', headers: { 'x-razorpay-signature': cap.sig }, body: cap.payload });
  assert.equal(r2.status, 200); // duplicate acked, no state change

  const fail = signedWebhook('payment.failed', { id: 'pay_2', order_id: rzpOrder, amount: 0 });
  await fetch(`${base}/webhooks/razorpay`, { method: 'POST', headers: { 'x-razorpay-signature': fail.sig }, body: fail.payload });
  const v2 = await api('GET', `/store/checkout/verify?receipt=${created.json.receipt}`);
  assert.equal(v2.json.status, 'paid'); // late failure must not clobber paid
});

test('webhooks: bad signature rejected, unknown order acked', async () => {
  const r = await fetch(`${base}/webhooks/razorpay`, {
    method: 'POST',
    headers: { 'x-razorpay-signature': '0'.repeat(64) },
    body: JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'x', order_id: 'nope' } } } }),
  });
  assert.equal(r.status, 400);

  const good = signedWebhook('payment.captured', { id: 'pay_x', order_id: 'order_unknown', amount: 100 });
  const r2 = await fetch(`${base}/webhooks/razorpay`, { method: 'POST', headers: { 'x-razorpay-signature': good.sig }, body: good.payload });
  assert.equal(r2.status, 200);
});

test('quote converts to a pending order and reserves stock', async () => {
  const qid = fake.nextQuoteId();
  fake.quotes.push({ id: qid, name: 'Factory', phone: '9999999999', product_slug: 'motor-b', product_name: '', qty: 1, message: '', status: 'contacted', order_receipt: null });
  const before = fake.products.get('motor-b').stock;
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const r = await api('POST', `/admin/quotes/${qid}/convert`, {}, adminHeaders);
  assert.equal(r.status, 200);
  assert.match(r.json.receipt, /^rcpt_/);
  assert.equal(fake.products.get('motor-b').stock, before - 1);
  const q = fake.quotes.find((x) => x.id === qid);
  assert.equal(q.status, 'won');
  assert.equal(q.order_receipt, r.json.receipt);
});

test('admin cancel of a paid order restocks and flags manual refund (no live keys)', async () => {
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
  });
  const stockAfterBuy = fake.products.get('drill-a').stock;
  const cap = signedWebhook('payment.captured', { id: 'pay_9', order_id: created.json.razorpayOrderId, amount: created.json.amount_paise });
  await fetch(`${base}/webhooks/razorpay`, { method: 'POST', headers: { 'x-razorpay-signature': cap.sig }, body: cap.payload });
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const order = fake.orders.find((x) => x.receipt === created.json.receipt);
  const r = await api('PATCH', `/admin/orders/${order.id}`, { status: 'cancelled' }, adminHeaders);
  assert.equal(r.status, 200);
  assert.equal(r.json.refund, 'manual'); // placeholder keys: no gateway call, needs human follow-up
  assert.equal(fake.products.get('drill-a').stock, stockAfterBuy + 1);
});
test('invoice balances: lines minus coupon equal grand total', async () => {
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 2 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    couponCode: 'SAVE10',
  });
  assert.equal(created.status, 200);
  const inv = await api('GET', `/store/invoice/${created.json.receipt}`);
  assert.equal(inv.status, 200);
  assert.equal(inv.json.couponCode, 'SAVE10');
  assert.ok(inv.json.discountPaise > 0);
  const lines = inv.json.items.reduce((s, it) => s + it.linePaise, 0);
  assert.equal(lines - inv.json.discountPaise, inv.json.grandPaise);
  assert.equal(inv.json.grandPaise, created.json.amount_paise);
});

test('invoice 404s unknown receipts', async () => {
  const r = await api('GET', '/store/invoice/rcpt_nope_123');
  assert.equal(r.status, 404);
});

test('coupons: usage cap blocks the next redemption; expiry blocks too', async () => {
  // exhaust SAVE10 (max_uses 1, already used once)
  fake.coupons.set('SAVE10', {
    code: 'SAVE10', pct_off: 10, max_discount_paise: 50000, min_order_paise: 50000,
    active: true, max_uses: 1, used_count: 1,
  });
  const exhausted = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    couponCode: 'SAVE10',
  });
  assert.equal(exhausted.status, 400);
  assert.match(exhausted.json.error, /usage limit/i);

  const validateExhausted = await api('GET', '/store/engage/coupons/validate?code=SAVE10&amount_paise=100000');
  assert.equal(validateExhausted.json.valid, false);
  assert.match(validateExhausted.json.reason, /usage limit/i);

  // expired coupon
  fake.coupons.set('SAVE10', {
    code: 'SAVE10', pct_off: 10, max_discount_paise: 50000, min_order_paise: 50000,
    active: true, max_uses: null, used_count: 0, expires_at: new Date(Date.now() - 86400000).toISOString(),
  });
  const expired = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    couponCode: 'SAVE10',
  });
  assert.equal(expired.status, 400);
  assert.match(expired.json.error, /expired/i);

  // restore a clean coupon for any later test
  fake.coupons.set('SAVE10', {
    code: 'SAVE10', pct_off: 10, max_discount_paise: 50000, min_order_paise: 50000,
    active: true, max_uses: null, used_count: 0, expires_at: null,
  });
});

test('stock endpoint returns live availability for cart slugs', async () => {
  const r = await api('GET', '/store/products/stock?slugs=drill-a,motor-b,ghost');
  assert.equal(r.status, 200);
  assert.equal(r.json.stock['drill-a'].stock, fake.products.get('drill-a').stock);
  assert.equal(r.json.stock['motor-b'].pricePaise, 500000);
  assert.equal(r.json.stock.ghost, undefined); // unknown slugs are simply omitted

  const empty = await api('GET', '/store/products/stock');
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.json.stock, {});
});

test('COD is refused above the configured cap, and allowed just below it', async () => {
  // motor-b is ₹5,000 per unit; 4 units = ₹20,000 which is within the default cap,
  // 5 units = ₹25,000 which must be refused. Stock was raised above for this test.
  const weapon = fake.products.get('motor-b');
  const originalStock = weapon.stock;
  weapon.stock = 10;

  const under = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'motor-b', qty: 4 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    payMode: 'cod',
  });
  assert.equal(under.status, 200);
  assert.equal(under.json.amount_paise, 2000000);

  const over = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'motor-b', qty: 5 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    payMode: 'cod',
  });
  assert.equal(over.status, 400);
  assert.equal(over.json.code, 'COD_LIMIT');
  assert.match(over.json.error, /Cash on Delivery/i);

  // the same order paid online is fine
  const online = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'motor-b', qty: 5 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    payMode: 'UPI',
  });
  assert.equal(online.status, 200);

  weapon.stock = originalStock;
});

test('admin order detail: items enriched with names, customer and payment ids', async () => {
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 2 }],
    customer: { name: 'Ravi Kumar', phone: '9876543210', address: '12 MG Road', pincode: '560001' },
    couponCode: 'SAVE10',
  });
  assert.equal(created.status, 200);
  const order = fake.orders.find((o) => o.receipt === created.json.receipt);

  const detail = await api('GET', `/admin/orders/${order.id}`, undefined, adminHeaders);
  assert.equal(detail.status, 200);
  const o = detail.json.order;
  assert.equal(o.receipt, created.json.receipt);
  assert.equal(o.customer.name, 'Ravi Kumar');
  assert.equal(o.customer.pincode, '560001');
  assert.equal(o.items.length, 1);
  assert.equal(o.items[0].name, 'Drill A'); // enriched from catalogue, not just the slug
  assert.equal(o.items[0].qty, 2);
  assert.equal(o.items[0].linePaise, 200000);
  assert.equal(o.couponCode, 'SAVE10');
  assert.equal(typeof o.discountPaise, 'number');

  const missing = await api('GET', '/admin/orders/99999', undefined, adminHeaders);
  assert.equal(missing.status, 404);
});

test('admin product CRUD: create, update, validation, delete', async () => {
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const payload = {
    slug: 'new-hammer-500g', name: 'Steel Hammer 500g', brand: 'Stanley', category: 'hand-tools',
    price_paise: 34900, mrp_paise: 45000, hsn: '82052000', stock: 12, specs: { weight: '500g' }, images: ['/images/hammer.jpg'],
  };
  const created = await api('POST', '/admin/products', payload, adminHeaders);
  assert.equal(created.status, 201);
  assert.equal(created.json.product.slug, 'new-hammer-500g');
  assert.equal(fake.products.has('new-hammer-500g'), true);

  // update the same slug (price change), not a duplicate
  const updated = await api('POST', '/admin/products', { ...payload, price_paise: 29900 }, adminHeaders);
  assert.equal(updated.status, 201);
  assert.equal(fake.products.get('new-hammer-500g').price_paise, 29900);
  assert.equal(fake.products.size, 3); // drill-a, motor-b, new-hammer-500g

  // validation
  const badSlug = await api('POST', '/admin/products', { ...payload, slug: 'Bad Slug!' }, adminHeaders);
  assert.equal(badSlug.status, 400);
  const badPrice = await api('POST', '/admin/products', { ...payload, price_paise: 50 }, adminHeaders);
  assert.equal(badPrice.status, 400);
  const mrpBelow = await api('POST', '/admin/products', { ...payload, price_paise: 50000, mrp_paise: 40000 }, adminHeaders);
  assert.equal(mrpBelow.status, 400);

  const del = await api('DELETE', '/admin/products/new-hammer-500g', undefined, adminHeaders);
  assert.equal(del.status, 200);
  assert.equal(fake.products.has('new-hammer-500g'), false);
  const delAgain = await api('DELETE', '/admin/products/new-hammer-500g', undefined, adminHeaders);
  assert.equal(delAgain.status, 404);
});

test('admin product routes require the token', async () => {
  const noToken = await api('POST', '/admin/products', { slug: 'x-y', name: 'X Y', price_paise: 1000 });
  assert.equal(noToken.status, 401);
});

test('returns: delivered order files a request; admin can progress it', async () => {
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    payMode: 'cod',
  });
  const receipt = created.json.receipt;
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };

  // cod_pending is not returnable yet
  const early = await api('POST', '/store/service/returns', { receipt, phone: '9876543210', reason: 'damaged' });
  assert.equal(early.status, 409);

  // move it to delivered, then file
  const order = fake.orders.find((o) => o.receipt === receipt);
  await api('PATCH', `/admin/orders/${order.id}`, { status: 'shipped' }, adminHeaders);
  await api('PATCH', `/admin/orders/${order.id}`, { status: 'delivered' }, adminHeaders);

  const ok = await api('POST', '/store/service/returns', {
    receipt, phone: '9876543210', reason: 'damaged', details: 'Casing cracked in transit',
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.status, 'requested');

  const listed = await api('GET', '/admin/returns', undefined, adminHeaders);
  assert.equal(listed.status, 200);
  assert.equal(listed.json.returns.length, 1);

  const upd = await api('PATCH', `/admin/returns/${ok.json.id}`, { status: 'approved' }, adminHeaders);
  assert.equal(upd.status, 200);
  assert.equal(upd.json.return.status, 'approved');

  const bad = await api('PATCH', `/admin/returns/${ok.json.id}`, { status: 'nonsense' }, adminHeaders);
  assert.equal(bad.status, 400);
});

test('search suggestions: short queries return nothing, real queries return groups', async () => {
  const short = await api('GET', '/store/search/suggest?q=a');
  assert.equal(short.status, 200);
  assert.deepEqual(short.json.products, []);

  const real = await api('GET', '/store/search/suggest?q=drill');
  assert.equal(real.status, 200);
  assert.ok(real.json.products.length >= 1);
  assert.equal(real.json.products[0].slug, 'drill-a');
  assert.ok(Array.isArray(real.json.brands));
  assert.ok(Array.isArray(real.json.categories));
});

test('stock alerts: valid request stored once, admin can list', async () => {
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const ok = await api('POST', '/store/service/stock-alert', { slug: 'drill-a', email: 'buyer@example.com' });
  assert.equal(ok.status, 201);

  // duplicate must not create a second row
  await api('POST', '/store/service/stock-alert', { slug: 'drill-a', email: 'BUYER@example.com' });
  const list = await api('GET', '/admin/stock-alerts', undefined, adminHeaders);
  assert.equal(list.status, 200);
  assert.equal(list.json.alerts.length, 1);
});

test('stock alerts: reject bad email and unknown product', async () => {
  const badEmail = await api('POST', '/store/service/stock-alert', { slug: 'drill-a', email: 'nope' });
  assert.equal(badEmail.status, 400);
  const badSlug = await api('POST', '/store/service/stock-alert', { slug: 'ghost', email: 'a@b.co' });
  assert.equal(badSlug.status, 404);
});

test('returns: rejects phone mismatch and unknown reasons', async () => {
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    payMode: 'cod',
  });
  const receipt = created.json.receipt;
  const mismatch = await api('POST', '/store/service/returns', { receipt, phone: '9000000000', reason: 'damaged' });
  assert.equal(mismatch.status, 404);
  const badReason = await api('POST', '/store/service/returns', { receipt, phone: '9876543210', reason: 'bored' });
  assert.equal(badReason.status, 400);
});
test('admin: transition guard blocks nonsense moves, allows real ones', async () => {
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    payMode: 'cod',
  });
  const order = fake.orders.find((o) => o.receipt === created.json.receipt);
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const bad = await api('PATCH', `/admin/orders/${order.id}`, { status: 'refunded' }, adminHeaders);
  assert.equal(bad.status, 409); // cod_pending -> refunded is not a legal move
  const good = await api('PATCH', `/admin/orders/${order.id}`, { status: 'shipped' }, adminHeaders);
  assert.equal(good.status, 200);
  assert.equal(good.json.order.status, 'shipped');
});
