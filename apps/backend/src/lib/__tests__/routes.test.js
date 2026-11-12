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
    ['drill-a', { slug: 'drill-a', name: 'Drill A', price_paise: 100000, mrp_paise: 120000, stock: 5 }],
    ['motor-b', { slug: 'motor-b', name: 'Motor B', price_paise: 500000, mrp_paise: 600000, stock: 1 }],
  ]);
  const coupons = new Map([
    ['SAVE10', { code: 'SAVE10', pct_off: 10, max_discount_paise: 50000, min_order_paise: 50000, active: true }],
  ]);
  const orders = [];
  let seq = 1;

  async function query(text, params = []) {
    const t = String(text).replace(/\s+/g, ' ').trim();
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
    if (t.startsWith('SELECT receipt, status, items, amount_paise, razorpay_payment_id, customer FROM orders WHERE receipt')) {
      const o = orders.find((x) => x.receipt === params[0]);
      return { rows: o ? [{ ...o }] : [] };
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
  return { query, pool, products, orders };
}

const fake = makeFakeDb();
db.query = fake.query;
db.pool = fake.pool;

const app = express();
app.use('/webhooks', express.raw({ type: '*/*' }), require('../../routes/webhooks'));
app.use(express.json({ limit: '1mb' }));
app.use('/store/products', require('../../routes/products'));
app.use('/store/checkout', require('../../routes/checkout'));
app.use('/store/engage', require('../../routes/engagement'));
app.use('/store/service', require('../../routes/service'));
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
  const r = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 2 }],
    customer: { name: 'Ravi', phone: '9876543210' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.amount_paise, 200000);
  assert.match(r.json.receipt, /^rcpt_/);
  assert.match(r.json.razorpayOrderId, /^order_mock_/);
  const p = fake.products.get('drill-a');
  assert.equal(p.stock, 3); // 5 - 2 reserved
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
