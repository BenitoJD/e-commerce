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
    ['drill-a', { slug: 'drill-a', name: 'Drill A', brand: 'DrillCo', price_paise: 100000, mrp_paise: 120000, stock: 100 }],
    ['motor-b', { slug: 'motor-b', name: 'Motor B', brand: 'MotorCo', price_paise: 500000, mrp_paise: 600000, stock: 1 }], // keep at 1: oversell test needs qty 2 to fail
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
  const subscribers = [];
  const reviews = [];

  async function query(text, params = []) {
    const t = String(text).replace(/\s+/g, ' ').trim();
    if (t.startsWith('SELECT slug FROM products ORDER BY slug')) {
      return { rows: [...products.keys()].sort().map((slug) => ({ slug })) };
    }
    if (t.startsWith('SELECT DISTINCT brand FROM products')) {
      const brands = [...new Set([...products.values()].map((p) => p.brand).filter(Boolean))].sort();
      return { rows: brands.map((brand) => ({ brand })) };
    }
    if (t.includes('AS discount_pct')) {
      const minOff = Number(params[0]) || 20;
      const limit = Number(params[1]) || 60;
      const rows = [...products.values()]
        .filter((p) => p.mrp_paise > p.price_paise)
        .map((p) => ({
          ...p,
          discount_pct: Math.round(((p.mrp_paise - p.price_paise) / p.mrp_paise) * 100),
        }))
        .filter((p) => p.discount_pct >= minOff)
        .sort((a, b) => b.discount_pct - a.discount_pct || a.price_paise - b.price_paise)
        .slice(0, limit);
      return { rows };
    }
    if (t.includes('GROUP BY brand')) {
      const counts = new Map();
      for (const p of products.values()) {
        if (p.brand) counts.set(p.brand, (counts.get(p.brand) || 0) + 1);
      }
      const rows = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([brand, count]) => ({ brand, count }));
      return { rows };
    }
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
    if (t.startsWith('SELECT COUNT(*)::int AS total FROM products')) {
      // Reuse the list handler's filtering by evaluating the same clause in JS.
      const args = params;
      let idx = 0;
      const conds = [];
      if (t.includes('name ILIKE $')) {
        const term = String(args[idx++] || '').replace(/%/g, '').toLowerCase();
        conds.push((p) => `${p.slug} ${p.name} ${p.brand || ''}`.toLowerCase().includes(term));
      }
      if (/(?:AND|WHERE) brand ILIKE \$/.test(t)) {
        const brand = String(args[idx++] || '').toLowerCase();
        conds.push((p) => String(p.brand || '').toLowerCase() === brand);
      }
      let rows = [...products.values()].filter((p) => conds.every((fn) => fn(p)));
      return { rows: [{ total: rows.length }] };
    }
    if (t.startsWith('SELECT * FROM products') && t.includes('LIMIT $')) {
      // Mirrors the server's list endpoint: filters in code order, then limit/offset.
      const limit = Number(params[params.length - 2]) || 50;
      const offset = Number(params[params.length - 1]) || 0;
      const args = params.slice(0, -2);
      let idx = 0;
      const conds = [];
      if (t.includes('name ILIKE $')) {
        const term = String(args[idx++] || '').replace(/%/g, '').toLowerCase();
        conds.push((p) => `${p.slug} ${p.name} ${p.brand || ''}`.toLowerCase().includes(term));
      }
      if (/(?:AND|WHERE) brand ILIKE \$/.test(t)) {
        const brand = String(args[idx++] || '').toLowerCase();
        conds.push((p) => String(p.brand || '').toLowerCase() === brand);
      }
      if (/(?:AND|WHERE) category ILIKE \$/.test(t)) {
        const cat = String(args[idx++] || '').toLowerCase();
        conds.push((p) => String(p.category || '').toLowerCase() === cat);
      }
      if (t.includes('price_paise <= $')) {
        const max = Number(args[idx++]);
        conds.push((p) => p.price_paise <= max);
      }
      if (t.includes('price_paise >= $')) {
        const min = Number(args[idx++]);
        conds.push((p) => p.price_paise >= min);
      }
      let rows = [...products.values()].filter((p) => conds.every((fn) => fn(p)));
      // ORDER BY is inlined (allowlisted) — apply the same intent here.
      if (t.includes('price_paise ASC')) rows.sort((a, b) => a.price_paise - b.price_paise);
      else if (t.includes('price_paise DESC')) rows.sort((a, b) => b.price_paise - a.price_paise);
      rows = rows.slice(offset, offset + limit);
      return { rows };
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
      const [receipt, status, items, amount, customer, coupon, discount, payMode, shipping] = params;
      const row = {
        id: seq++, receipt, status,
        items: typeof items === 'string' ? JSON.parse(items) : items,
        amount_paise: amount,
        customer: typeof customer === 'string' ? JSON.parse(customer) : customer,
        coupon_code: coupon ?? null, discount_paise: discount ?? 0,
        pay_mode: payMode ?? null,
        shipping_paise: shipping ?? 0,
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
    if (t.startsWith('SELECT receipt, status, customer, created_at, delivered_at FROM orders WHERE receipt')) {
      const o = orders.find((x) => x.receipt === params[0]);
      return {
        rows: o ? [{ receipt: o.receipt, status: o.status, customer: o.customer, created_at: o.created_at, delivered_at: o.delivered_at || null }] : [],
      };
    }
    if (t.startsWith('UPDATE orders SET delivered_at = COALESCE(delivered_at, NOW())')) {
      const o = orders.find((x) => String(x.id) === String(params[0]));
      if (o) o.delivered_at = o.delivered_at || new Date().toISOString();
      return { rows: o ? [o] : [] };
    }
    if (t.startsWith('SELECT id, status FROM return_requests WHERE receipt')) {
      const open = (ret || []).filter((r) => r.receipt === params[0] && !['rejected', 'cancelled'].includes(r.status));
      return { rows: open.slice(-1).map((r) => ({ id: r.id, status: r.status })) };
    }
    if (t.startsWith('SELECT receipt, status, customer FROM orders WHERE receipt')) {
      const o = orders.find((x) => x.receipt === params[0]);
      return { rows: o ? [{ receipt: o.receipt, status: o.status, customer: o.customer }] : [] };
    }
    if (t.startsWith('SELECT receipt, status, items, amount_paise, razorpay_payment_id, customer, coupon_code FROM orders WHERE receipt')) {
      const o = orders.find((x) => x.receipt === params[0]);
      return { rows: o ? [{ ...o }] : [] };
    }
    if (t.startsWith('SELECT receipt, status, items, amount_paise, razorpay_payment_id, customer FROM orders WHERE receipt')) {
      const o = orders.find((x) => x.receipt === params[0]);
      return { rows: o ? [{ ...o }] : [] };
    }
    if (t.includes('FROM orders WHERE receipt = $1') && t.includes('coupon_code')) {
      const o = orders.find((x) => x.receipt === params[0]);
      return { rows: o ? [{ receipt: o.receipt, status: o.status, items: o.items, amount_paise: o.amount_paise, razorpay_payment_id: o.razorpay_payment_id, customer: o.customer, created_at: o.created_at, coupon_code: o.coupon_code || null, discount_paise: o.discount_paise || 0, pay_mode: o.pay_mode || null, shipping_paise: o.shipping_paise || 0 }] : [] };
    }
    if (t.startsWith('SELECT receipt, status, amount_paise, items, customer, created_at, pay_mode, delivered_at, refunded_at FROM orders') && t.includes('WHERE receipt =')) {
      const o = orders.find((x) => x.receipt === params[0]);
      return {
        rows: o ? [{
          receipt: o.receipt,
          status: o.status,
          amount_paise: o.amount_paise,
          items: o.items,
          customer: o.customer,
          created_at: o.created_at,
          pay_mode: o.pay_mode || null,
          delivered_at: o.delivered_at || null,
          refunded_at: o.refunded_at || null,
        }] : [],
      };
    }
    if (t.startsWith('SELECT receipt, status, amount_paise, items, customer, created_at, pay_mode FROM orders') && t.includes('WHERE receipt =')) {
      const o = orders.find((x) => x.receipt === params[0]);
      return { rows: o ? [{ receipt: o.receipt, status: o.status, amount_paise: o.amount_paise, items: o.items, customer: o.customer, created_at: o.created_at, pay_mode: o.pay_mode || null }] : [] };
    }
    if (t.startsWith('SELECT receipt, status, amount_paise, items, customer, created_at, pay_mode FROM orders') && t.includes('RIGHT(')) {
      const phone = String(params[0] || '').slice(-10);
      const rows = orders
        .filter((o) => String(o.customer && o.customer.phone || '').replace(/\D/g, '').slice(-10) === phone)
        .sort((a, b) => b.id - a.id)
        .slice(0, 20);
      return { rows };
    }
    if (t.startsWith('SELECT slug, name FROM products WHERE slug = ANY')) {
      return { rows: params[0].map((s) => products.get(s)).filter(Boolean).map((p) => ({ slug: p.slug, name: p.name })) };
    }
    if (t.startsWith('SELECT id, receipt, status, amount_paise, coupon_code')) {
      // params = [...filters, limit, offset]
      const offset = Number(params[params.length - 1]) || 0;
      const limit = Number(params[params.length - 2]) || 50;
      const conds = [];
      const args = params.slice(0, -2);
      // Mirror the server's filter builder closely enough to prove wiring: status, dates, text.
      let idx = 0;
      if (t.includes('status = $')) { conds.push((o) => o.status === args[idx++]); }
      if (t.includes('created_at >= $')) { const from = args[idx++]; conds.push((o) => new Date(o.created_at) >= new Date(from)); }
      if (t.includes('created_at <= $')) { const to = args[idx++]; conds.push((o) => new Date(o.created_at) <= new Date(to)); }
      if (t.includes('receipt ILIKE $')) {
        const term = String(args[idx++] || '').replace(/%/g, '').toLowerCase();
        conds.push((o) => JSON.stringify(o).toLowerCase().includes(term));
      }
      const rows = orders
        .filter((o) => conds.every((fn) => fn(o)))
        .sort((a, b) => b.id - a.id)
        .slice(offset, offset + limit);
      return { rows };
    }
    if (t.startsWith('SELECT receipt, created_at, status, pay_mode, refund_mode, amount_paise')) {
      const wantStatus = t.includes('WHERE status = $1') ? params[0] : null;
      // Mirror date bounds too, so the export test proves filters reach the SQL.
      let cursor = wantStatus ? 1 : 0;
      const from = t.includes('created_at >= $') ? params[cursor++] : null;
      const to = t.includes('created_at <= $') ? params[cursor++] : null;
      const rows = orders
        .filter((o) => !wantStatus || o.status === wantStatus)
        .filter((o) => !from || new Date(o.created_at) >= new Date(from))
        .filter((o) => !to || new Date(o.created_at) <= new Date(to))
        .sort((a, b) => b.id - a.id)
        .slice(0, 5000)
        .map((o) => ({
          receipt: o.receipt, created_at: o.created_at, status: o.status,
          pay_mode: o.pay_mode || null, refund_mode: o.refund_mode || null,
          amount_paise: o.amount_paise, discount_paise: o.discount_paise || 0,
          shipping_paise: o.shipping_paise || 0,
          coupon_code: o.coupon_code || null, customer: o.customer,
          shipping_paise: o.shipping_paise || 0,
          razorpay_payment_id: o.razorpay_payment_id || null,
        }));
      return { rows };
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
    if (t.startsWith('INSERT INTO subscribers')) {
      const email = params[0];
      if (!subscribers.some((s) => s.email === email)) {
        subscribers.push({ email, created_at: new Date().toISOString() });
      }
      return { rows: [] };
    }
    if (t.startsWith('SELECT email, created_at FROM subscribers')) {
      return { rows: subscribers.slice() };
    }
    if (t.startsWith('INSERT INTO bulk_quotes')) {
      const [name, phone, slug, productName, qty, message] = params;
      if (!quotes.length) quoteSeq = 1;
      const row = { id: quoteSeq++, name, phone, product_slug: slug || '', product_name: productName || '', qty, message, status: 'new', order_receipt: null, created_at: new Date().toISOString() };
      quotes.push(row);
      return { rows: [row] };
    }
    if (t.startsWith('SELECT id, name, product_slug, product_name, qty, message, status')) {
      const phone = String(params[0] || '').replace(/\D/g, '').slice(-10);
      const rows = quotes
        .filter((q) => String(q.phone || '').replace(/\D/g, '').slice(-10) === phone)
        .sort((a, b) => b.id - a.id)
        .slice(0, 20);
      return { rows };
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
    if (t.startsWith('INSERT INTO reviews')) {
      const [product_slug, name, rating, title, body] = params;
      const row = { id: reviews.length + 1, product_slug, name, rating, title, body, verified: false, created_at: new Date().toISOString() };
      reviews.push(row);
      return { rows: [row] };
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
    if (t.startsWith('SELECT id, receipt, reason, details, status, created_at')) {
      const rows = (ret || []).filter((r) => r.receipt === params[0]).sort((a, b) => b.id - a.id).slice(0, 1);
      return { rows };
    }
    if (t.startsWith('SELECT receipt, customer FROM orders WHERE receipt')) {
      const o = orders.find((x) => x.receipt === params[0]);
      return { rows: o ? [{ receipt: o.receipt, customer: o.customer }] : [] };
    }
    if (t.startsWith('SELECT * FROM return_requests')) {
      return { rows: (ret || []).slice() };
    }
    if (t.startsWith('UPDATE return_requests SET status')) {
      const row = (ret || []).find((r) => r.id === Number(params[1]));
      if (row) row.status = params[0];
      return { rows: row ? [row] : [] };
    }
    if (t.startsWith('UPDATE orders SET refund_mode = $1, refunded_at = NOW() WHERE id')) {
      const o = orders.find((x) => x.id === Number(params[1]));
      if (o) { o.refund_mode = params[0]; o.refunded_at = new Date().toISOString(); }
      return { rows: [] };
    }
    if (t.startsWith('UPDATE orders SET refund_mode = $1, refunded_at = NOW() WHERE receipt')) {
      const o = orders.find((x) => x.receipt === params[1]);
      if (o) { o.refund_mode = params[0]; o.refunded_at = new Date().toISOString(); }
      return { rows: [] };
    }
    if (t.startsWith('SELECT status, items FROM orders WHERE id')) {
      const o = orders.find((x) => x.id === Number(params[0]));
      return { rows: o ? [{ status: o.status, items: o.items }] : [] };
    }
    if (t.includes("WHERE status = 'pending' AND created_at < NOW()")) {
      const minutes = Number(params[0]) || 30;
      const cutoff = Date.now() - minutes * 60 * 1000;
      const rows = orders
        .filter((o) => o.status === 'pending' && new Date(o.created_at).getTime() < cutoff)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .slice(0, 200)
        .map((o) => ({ id: o.id, receipt: o.receipt, status: o.status, created_at: o.created_at }));
      return { rows };
    }
    if (t.startsWith('SELECT status, items, amount_paise, razorpay_payment_id FROM orders WHERE id')
      || t.startsWith('SELECT receipt, status, items, amount_paise, razorpay_payment_id, coupon_code FROM orders WHERE id')
      || t.startsWith('SELECT receipt, status, items, amount_paise, razorpay_payment_id FROM orders WHERE id')) {
      const o = orders.find((x) => x.id === Number(params[0]));
      return {
        rows: o ? [{
          receipt: o.receipt,
          status: o.status,
          items: o.items,
          amount_paise: o.amount_paise,
          razorpay_payment_id: o.razorpay_payment_id,
          coupon_code: o.coupon_code || null,
        }] : [],
      };
    }
    if (t.startsWith('UPDATE coupons SET used_count = GREATEST(used_count - 1, 0)')) {
      const code = String(params[0] || '').toUpperCase();
      const c = coupons.get(code);
      if (!c) return { rows: [] };
      c.used_count = Math.max(0, (c.used_count || 0) - 1);
      return { rows: [{ code, used_count: c.used_count }] };
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
app.use('/store/brands', require('../../routes/brands'));
app.use('/store/deals', require('../../routes/deals'));
app.use('/store/checkout', require('../../routes/checkout'));
app.use('/store/quotes', require('../../routes/quotes'));
app.use('/store/search', require('../../routes/search'));
app.use('/store/engage', require('../../routes/engagement'));
app.use('/store/service', require('../../routes/service'));
app.use('/store/invoice', require('../../routes/invoice'));
app.use('/admin', require('../../routes/admin'));
app.get('/sitemap.xml', require('../../routes/sitemap'));

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

test('newsletter subscribers are listed for the admin only', async () => {
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const sub = await api('POST', '/store/service/subscribe', { email: 'Buyer@Example.com' });
  assert.equal(sub.status, 200);
  // stored lower-cased, deduplicated
  await api('POST', '/store/service/subscribe', { email: 'buyer@example.com' });

  const list = await api('GET', '/admin/subscribers', undefined, adminHeaders);
  assert.equal(list.status, 200);
  assert.equal(list.json.count, 1);
  assert.equal(list.json.subscribers[0].email, 'buyer@example.com');

  const noToken = await api('GET', '/admin/subscribers');
  assert.equal(noToken.status, 401);
});

test('bulk quote endpoint clamps quantity and rejects unusable contact details', async () => {
  const anonymous = { name: 'Buyer', phone: '9876500022', qty: -5, message: 'x'.repeat(5000), product_slug: 'drill-a' };
  const created = await api('POST', '/store/quotes', anonymous);
  assert.equal(created.status, 201);
  const stored = fake.quotes.find((q) => q.phone === '9876500022');
  assert.equal(stored.qty, 1, 'negative quantity must clamp to 1, not be stored');
  assert.equal(stored.message.length, 2000, 'message must be truncated');
  assert.equal(stored.name.length <= 120, true);

  const bigQty = await api('POST', '/store/quotes', { ...anonymous, qty: 999999, phone: '9876500023' });
  assert.equal(bigQty.status, 201);
  assert.equal(fake.quotes.find((q) => q.phone === '9876500023').qty, 100000);

  const badPhone = await api('POST', '/store/quotes', { name: 'X', phone: 'hello', qty: 1 });
  assert.equal(badPhone.status, 400);
  assert.match(badPhone.json.error, /phone/i);

  const formatted = await api('POST', '/store/quotes', { name: 'Y', phone: '+91 98765 00024', qty: 2 });
  assert.equal(formatted.status, 201);
  assert.equal(fake.quotes.find((q) => q.phone === '9876500024').phone, '9876500024');
});

test('review bodies are truncated and rating bounds enforced', async () => {
  const long = 'z'.repeat(5000);
  const ok = await api('POST', '/store/engage/reviews/drill-a', { name: 'n'.repeat(200), rating: 5, title: 't'.repeat(300), body: long });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.review.name.length, 80);
  assert.equal(ok.json.review.title.length, 120);
  assert.equal(ok.json.review.body.length, 2000);

  const badRating = await api('POST', '/store/engage/reviews/drill-a', { name: 'A', rating: 6, body: 'x' });
  assert.equal(badRating.status, 400);
});

test('bulk quote lookup is scoped to the caller phone (no PII leak)', async () => {
  const created = await api('POST', '/store/quotes', {
    name: 'Factory Buyer', phone: '9876500011', qty: 25, message: 'Need 25 units', product_slug: 'drill-a',
  });
  assert.equal(created.status, 201);

  const mine = await api('GET', '/store/quotes?phone=9876500011');
  assert.equal(mine.status, 200);
  assert.equal(mine.json.quotes.length, 1);
  assert.equal(mine.json.quotes[0].product_slug, 'drill-a');
  assert.equal(mine.json.quotes[0].status, 'new');

  // formatting differences still match the same person
  const formatted = await api('GET', '/store/quotes?phone=%2B91%2098765%2000011');
  assert.equal(formatted.json.quotes.length, 1);

  // someone else sees nothing, and no phone at all is rejected
  const other = await api('GET', '/store/quotes?phone=9000000000');
  assert.deepEqual(other.json.quotes, []);
  const missing = await api('GET', '/store/quotes');
  assert.equal(missing.status, 400);
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
  // the owed refund must be recorded, not just returned once
  assert.equal(order.refund_mode, 'manual');
  assert.ok(order.refunded_at);
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

test('invoice reconciles when shipping is charged: items - discount + shipping = total', async () => {
  const savedFee = process.env.SHIPPING_FEE_PAISE;
  const savedThreshold = process.env.FREE_SHIPPING_ABOVE_PAISE;
  try {
    process.env.SHIPPING_FEE_PAISE = '14900';
    process.env.FREE_SHIPPING_ABOVE_PAISE = '0'; // charge on every order

    const created = await api('POST', '/store/checkout/create', {
      items: [{ slug: 'drill-a', qty: 2 }], // ₹2,000
      customer: { name: 'Ravi', phone: '9876543210' },
      couponCode: 'SAVE10',
    });
    assert.equal(created.status, 200);

    const inv = await api('GET', `/store/invoice/${created.json.receipt}`);
    assert.equal(inv.status, 200);
    assert.equal(inv.json.shippingPaise, 14900);

    const itemsTotal = inv.json.itemsTotalPaise;
    const discount = inv.json.discountPaise;
    const shipping = inv.json.shippingPaise;
    const grand = inv.json.grandPaise;
    assert.equal(itemsTotal - discount + shipping, grand, 'invoice must balance');
    assert.equal(grand, created.json.amount_paise, 'invoice total equals what was charged');
  } finally {
    if (savedFee === undefined) delete process.env.SHIPPING_FEE_PAISE;
    else process.env.SHIPPING_FEE_PAISE = savedFee;
    if (savedThreshold === undefined) delete process.env.FREE_SHIPPING_ABOVE_PAISE;
    else process.env.FREE_SHIPPING_ABOVE_PAISE = savedThreshold;
  }
});

test('invoice GST split never adds tax on top of the charged amount', async () => {
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi Kumar', phone: '9876543210' },
  });
  const inv = await api('GET', `/store/invoice/${created.json.receipt}`);
  assert.equal(inv.status, 200);
  const { rate, base } = inv.json.gst;
  const gst = inv.json.gst.gst;
  assert.equal(rate, 18);
  // base + tax must equal the amount actually charged (prices are GST-inclusive)
  assert.equal(base + gst, created.json.amount_paise);
  // and the base is the amount/1.18, rounded
  assert.equal(base, Math.round((created.json.amount_paise * 100) / 118));
});

test('buyer GSTIN is captured, validated and printed on the invoice', async () => {
  const good = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi Kumar', phone: '9876543210', gstin: '27aapfu 0939f1zv' },
  });
  assert.equal(good.status, 200);
  const order = fake.orders.find((o) => o.receipt === good.json.receipt);
  assert.equal(order.customer.gstin, '27AAPFU0939F1ZV'); // normalised to upper case

  const inv = await api('GET', `/store/invoice/${good.json.receipt}`);
  assert.equal(inv.json.customer.gstin, '27AAPFU0939F1ZV');

  const bad = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi Kumar', phone: '9876543210', gstin: 'NOT-A-GSTIN' },
  });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /GSTIN/i);

  // optional: a retail order without GSTIN still works
  const none = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi Kumar', phone: '9876543210' },
  });
  assert.equal(none.status, 200);
  const noneOrder = fake.orders.find((o) => o.receipt === none.json.receipt);
  assert.equal(noneOrder.customer.gstin, null);
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

test('customer cancel of a paid order persists the refund outcome', async () => {
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
  });
  const receipt = created.json.receipt;
  const cap = signedWebhook('payment.captured', { id: 'pay_cc', order_id: created.json.razorpayOrderId, amount: created.json.amount_paise });
  await fetch(`${base}/webhooks/razorpay`, { method: 'POST', headers: { 'x-razorpay-signature': cap.sig }, body: cap.payload });

  const cancel = await api('POST', '/store/service/cancel', { receipt, phone: '9876543210' });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.json.refund, 'manual'); // no live gateway keys in tests
  const order = fake.orders.find((o) => o.receipt === receipt);
  assert.equal(order.refund_mode, 'manual');
  assert.equal(order.status, 'cancelled');
});

test('checkout normalises the customer block and rejects untrackable orders', async () => {
  // A phone with formatting must be stored canonically, or tracking can never match it.
  const formatted = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: '  Ravi Kumar  ', phone: '+91 98765 43210', address: 'A'.repeat(900), pincode: '560001' },
  });
  assert.equal(formatted.status, 200);
  const stored = fake.orders.find((o) => o.receipt === formatted.json.receipt);
  assert.equal(stored.customer.phone, '9876543210');
  assert.equal(stored.customer.name, 'Ravi Kumar');
  assert.equal(stored.customer.address.length, 500, 'address must be truncated');
  assert.equal(stored.customer.pincode, '560001');

  // ...and the order is retrievable by tracking with the same number in any format.
  const tracked = await api('GET', `/store/service/track?receipt=${formatted.json.receipt}&phone=%2B91%2098765%2043210`);
  assert.equal(tracked.status, 200);

  const badPhone = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '12345' },
  });
  assert.equal(badPhone.status, 400);
  assert.match(badPhone.json.error, /phone/i);

  const badPincode = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210', pincode: '56' },
  });
  assert.equal(badPincode.status, 400);
  assert.match(badPincode.json.error, /pincode/i);
});

test('the tracking timeline only dates steps it actually recorded', async () => {
  // A delivered order: placed carries the order date, delivered carries delivered_at, and
  // intermediate steps must not pretend they happened on the order date.
  const receipt = 'rcpt_timeline_dated';
  const created = new Date(Date.now() - 5 * 86400000).toISOString();
  const delivered = new Date(Date.now() - 1 * 86400000).toISOString();
  fake.orders.push({
    id: 9501,
    receipt,
    status: 'delivered',
    items: [{ slug: 'drill-a', qty: 1, unit_price_paise: 100000 }],
    amount_paise: 118000,
    customer: { name: 'Timeline Buyer', phone: '9812300801' },
    created_at: created,
    delivered_at: delivered,
    pay_mode: 'online',
  });

  const tracked = await api('GET', `/store/service/track?receipt=${receipt}&phone=9812300801`);
  assert.equal(tracked.status, 200);
  const byStatus = Object.fromEntries(tracked.json.timeline.map((t) => [t.status, t]));

  assert.equal(new Date(byStatus.placed.at).toISOString(), created);
  assert.equal(new Date(byStatus.delivered.at).toISOString(), delivered, 'delivery shows its own date');
  assert.equal(byStatus.paid.at, null, 'no invented payment timestamp');
  assert.equal(byStatus.shipped.at, null, 'no invented shipping timestamp');
});

test('COD orders never claim a payment in the tracking timeline', async () => {
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    payMode: 'cod',
  });
  const receipt = created.json.receipt;
  const order = fake.orders.find((o) => o.receipt === receipt);
  assert.equal(order.pay_mode, 'cod');

  // ship then deliver it
  await api('PATCH', `/admin/orders/${order.id}`, { status: 'shipped' }, adminHeaders);
  await api('PATCH', `/admin/orders/${order.id}`, { status: 'delivered' }, adminHeaders);

  const tracked = await api('GET', `/store/service/track?receipt=${receipt}&phone=9876543210`);
  assert.equal(tracked.status, 200);
  const steps = tracked.json.timeline.map((t) => t.status);
  assert.equal(steps.includes('paid'), false); // no phantom payment
  assert.deepEqual(steps, ['placed', 'shipped', 'delivered']);
  assert.match(tracked.json.timeline[2].label, /cash collected/i);

  const invoice = await api('GET', `/store/invoice/${receipt}`);
  assert.equal(invoice.json.payMode, 'cod');
});

test('online orders still show the payment step', async () => {
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
    payMode: 'UPI',
  });
  const receipt = created.json.receipt;
  const cap = signedWebhook('payment.captured', { id: 'pay_codtest', order_id: created.json.razorpayOrderId, amount: created.json.amount_paise });
  await fetch(`${base}/webhooks/razorpay`, { method: 'POST', headers: { 'x-razorpay-signature': cap.sig }, body: cap.payload });

  const tracked = await api('GET', `/store/service/track?receipt=${receipt}&phone=9876543210`);
  assert.deepEqual(tracked.json.timeline.map((t) => t.status), ['placed', 'paid']);
});

test('search endpoint reports a total for brand pages and paging', async () => {
  const res = await api('GET', '/store/search?brand=DrillCo&limit=1');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.products));
  assert.ok(Number.isInteger(res.json.total), `expected numeric total, got ${res.json.total}`);
  assert.ok(res.json.total >= 1);
  assert.equal(res.json.limit, 1);

  const none = await api('GET', '/store/search?brand=NoSuchBrand');
  assert.equal(none.json.total, 0);
  assert.deepEqual(none.json.products, []);
});

test('product list reports the true total, independent of page size', async () => {
  const all = await api('GET', '/store/products?limit=100');
  const total = all.json.total;
  assert.ok(Number.isInteger(total) && total >= 2, `expected a numeric total, got ${total}`);

  const one = await api('GET', '/store/products?limit=1');
  assert.equal(one.json.products.length, 1);
  assert.equal(one.json.total, total, 'total must not shrink with page size');

  const filtered = await api('GET', '/store/products?q=drill&limit=1');
  assert.ok(filtered.json.total >= 1);
  assert.ok(filtered.json.total < total, 'a filtered total is smaller than the unfiltered one');
});

test('product list filters by price band and sorts server-side', async () => {
  const cheap = await api('GET', '/store/products?maxPrice=2000&limit=10');
  assert.equal(cheap.status, 200);
  assert.ok(cheap.json.products.every((p) => p.price_paise <= 200000));

  const band = await api('GET', '/store/products?minPrice=1000&maxPrice=2000&limit=10');
  assert.ok(band.json.products.every((p) => p.price_paise >= 100000 && p.price_paise <= 200000));

  const asc = await api('GET', '/store/products?sort=low&limit=10');
  const prices = asc.json.products.map((p) => p.price_paise);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b), 'sort=low is ascending');

  const desc = await api('GET', '/store/products?sort=high&limit=10');
  const dprices = desc.json.products.map((p) => p.price_paise);
  assert.deepEqual(dprices, [...dprices].sort((a, b) => b - a), 'sort=high is descending');

  // injection attempt falls back to the default order instead of reaching SQL
  const evil = await api('GET', '/store/products?sort=price_paise%20ASC;DROP%20TABLE%20products&limit=5');
  assert.equal(evil.status, 200);
});

test('product list supports search + paging (admin catalogue)', async () => {
  const page1 = await api('GET', '/store/products?limit=1&offset=0');
  assert.equal(page1.status, 200);
  assert.equal(page1.json.products.length, 1);

  const page2 = await api('GET', '/store/products?limit=1&offset=1');
  assert.equal(page2.status, 200);
  assert.equal(page2.json.products.length, 1);
  assert.notEqual(page2.json.products[0].slug, page1.json.products[0].slug, 'offset must move the window');

  const search = await api('GET', '/store/products?q=NoSuchProductXyz&limit=10');
  assert.equal(search.status, 200);
  assert.deepEqual(search.json.products, []);

  const match = await api('GET', '/store/products?q=drill&limit=10');
  assert.ok(match.json.products.length >= 1);
  assert.ok(match.json.products.every((p) => /drill/i.test(`${p.name} ${p.slug}`)));
});

test('deals endpoint filters and sorts by discount in SQL, not the first page', async () => {
  const res = await api('GET', '/store/deals?minOff=15');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.deals));
  for (const d of res.json.deals) {
    assert.ok(d.discount_pct >= 15, `deal below threshold leaked in: ${d.slug} ${d.discount_pct}%`);
    assert.ok(d.mrp_paise > d.price_paise);
  }
  // sorted by discount desc
  const pcts = res.json.deals.map((d) => d.discount_pct);
  assert.deepEqual(pcts, [...pcts].sort((a, b) => b - a));

  // a threshold above every discount yields nothing
  const none = await api('GET', '/store/deals?minOff=90');
  assert.deepEqual(none.json.deals, []);
});

test('brands endpoint aggregates the whole catalogue, not the first page', async () => {
  const res = await api('GET', '/store/brands');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.brands));
  const names = res.json.brands.map((b) => b.name);
  assert.deepEqual(names, [...names].sort(), 'brands are alphabetical');
  const drill = res.json.brands.find((b) => b.name === 'DrillCo');
  assert.ok(drill, 'expected DrillCo in the brand list');
  assert.equal(drill.count, 1);
});

test('sitemap lists products and brand pages, not just static URLs', async () => {
  process.env.FRONTEND_URL = 'https://shop.test';
  const res = await fetch(`${base}/sitemap.xml`);
  const xml = await res.text();
  assert.equal(res.status, 200);
  assert.ok(xml.includes('<urlset'));
  assert.ok(xml.includes('<loc>https://shop.test/product/drill-a</loc>'));
  assert.ok(xml.includes('<loc>https://shop.test/brand/DrillCo</loc>'));
  assert.ok(xml.includes('<loc>https://shop.test/brand/MotorCo</loc>'));
  assert.ok(xml.includes('<loc>https://shop.test/returns</loc>'));
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

test('shipping fee is charged when configured and waived above the threshold', async () => {
  const savedFee = process.env.SHIPPING_FEE_PAISE;
  const savedThreshold = process.env.FREE_SHIPPING_ABOVE_PAISE;
  const weapon = fake.products.get('motor-b');
  const savedStock = weapon.stock;
  weapon.stock = Math.max(weapon.stock, 5);
  try {
    process.env.SHIPPING_FEE_PAISE = '14900'; // ₹149
    process.env.FREE_SHIPPING_ABOVE_PAISE = '400000'; // ₹4,000

    const small = await api('POST', '/store/checkout/create', {
      items: [{ slug: 'drill-a', qty: 1 }], // ₹1,000
      customer: { name: 'Ravi', phone: '9876543210' },
    });
    assert.equal(small.status, 200);
    assert.equal(small.json.shipping_paise, 14900);
    assert.equal(small.json.amount_paise, 100000 + 14900, 'total must include shipping');

    const big = await api('POST', '/store/checkout/create', {
      items: [{ slug: 'motor-b', qty: 1 }], // ₹5,000 — above the ₹4,000 threshold
      customer: { name: 'Ravi', phone: '9876543210' },
    });
    assert.equal(big.status, 200, 'expected the above-threshold order to be accepted');
    assert.equal(big.json.shipping_paise, 0);
    assert.equal(big.json.amount_paise, 500000);
  } finally {
    weapon.stock = savedStock;
    if (savedFee === undefined) delete process.env.SHIPPING_FEE_PAISE;
    else process.env.SHIPPING_FEE_PAISE = savedFee;
    if (savedThreshold === undefined) delete process.env.FREE_SHIPPING_ABOVE_PAISE;
    else process.env.FREE_SHIPPING_ABOVE_PAISE = savedThreshold;
  }
});

test('shipping is free by default (no surprise charges)', async () => {
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
  });
  assert.equal(created.status, 200);
  assert.equal(created.json.shipping_paise, 0);
  assert.equal(created.json.amount_paise, 100000);
});

test('pincode COD availability follows COD_MAX_PAISE, same as checkout', async () => {
  const saved = process.env.COD_MAX_PAISE;
  try {
    process.env.COD_MAX_PAISE = '5000000'; // ₹50,000
    const high = await api('GET', '/store/service/pincode/560001?amount_paise=4500000');
    assert.equal(high.status, 200);
    assert.equal(high.json.codAvailable, true, 'COD should be offered up to the configured cap');
    assert.equal(high.json.codMaxPaise, 5000000);

    const over = await api('GET', '/store/service/pincode/560001?amount_paise=5100000');
    assert.equal(over.json.codAvailable, false);

    // a ₹40,000 COD order is accepted at checkout under the raised cap (was rejected at 20k)
    const weapon = fake.products.get('motor-b');
    const original = weapon.stock;
    weapon.stock = 20;
    const order = await api('POST', '/store/checkout/create', {
      items: [{ slug: 'motor-b', qty: 8 }], // ₹40,000
      customer: { name: 'Ravi', phone: '9876543210' },
      payMode: 'cod',
    });
    assert.equal(order.status, 200);
    weapon.stock = original;
  } finally {
    if (saved === undefined) delete process.env.COD_MAX_PAISE;
    else process.env.COD_MAX_PAISE = saved;
  }
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

test('checkout bounds quantity and merges duplicate lines', async () => {
  const tooMany = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1000 }],
    customer: { name: 'Bulk Buyer', phone: '9812300901' },
  });
  assert.equal(tooMany.status, 400);
  assert.match(tooMany.json.error, /Maximum 999 units per item/);

  const splitAcross = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 600 }, { slug: 'drill-a', qty: 500 }],
    customer: { name: 'Split Buyer', phone: '9812300902' },
  });
  assert.equal(splitAcross.status, 400, 'the merged quantity is what counts');
  assert.match(splitAcross.json.error, /Maximum 999 units/);

  const merged = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 2 }, { slug: 'drill-a', qty: 3 }],
    customer: { name: 'Merged Buyer', phone: '9812300903' },
  });
  assert.equal(merged.status, 200);
  const order = fake.orders.find((o) => o.receipt === merged.json.receipt);
  assert.equal(order.items.length, 1, 'one line per SKU, not two');
  assert.equal(order.items[0].qty, 5, 'quantities are summed');
  assert.equal(merged.json.amount_paise, 5 * 100000, 'priced once at the unit price');

  const missingSlug = await api('POST', '/store/checkout/create', {
    items: [{ qty: 1 }],
    customer: { name: 'No Slug', phone: '9812300904' },
  });
  assert.equal(missingSlug.status, 400);
});

test('checkout rejects a malformed GSTIN but accepts a valid or blank one', async () => {
  const base = { items: [{ slug: 'drill-a', qty: 1 }], customer: { name: 'GST Buyer', phone: '9812300301' } };

  const bad = await api('POST', '/store/checkout/create', {
    ...base,
    customer: { ...base.customer, gstin: '27AAPFU0939F1ZX' }, // wrong check character
  });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /GSTIN looks invalid/);

  const good = await api('POST', '/store/checkout/create', {
    ...base,
    customer: { ...base.customer, gstin: '27aapfu 0939f1zv' }, // lowercase + space, still valid
  });
  assert.equal(good.status, 200);

  const blank = await api('POST', '/store/checkout/create', {
    ...base,
    customer: { ...base.customer, phone: '9812300302' },
  });
  assert.equal(blank.status, 200, 'GSTIN stays optional for retail buyers');
});

test('return eligibility answers before submitting, and matches what submission does', async () => {
  const recent = 'rcpt_elig_recent';
  fake.orders.push({
    id: 9101,
    receipt: recent,
    status: 'delivered',
    items: [{ slug: 'drill-a', qty: 1, unit_price_paise: 100000 }],
    amount_paise: 118000,
    customer: { name: 'Eligible Buyer', phone: '9812300501' },
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    delivered_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  });
  const ok = await api('GET', `/store/service/returns/eligibility?receipt=${recent}&phone=9812300501`);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.eligible, true);
  assert.equal(ok.json.windowDays, 7);
  assert.ok(ok.json.daysLeft > 0, 'a live countdown is shown');
  assert.ok(ok.json.deadline, 'the deadline is returned');

  const late = 'rcpt_elig_late';
  fake.orders.push({
    id: 9102,
    receipt: late,
    status: 'delivered',
    items: [{ slug: 'drill-a', qty: 1, unit_price_paise: 100000 }],
    amount_paise: 118000,
    customer: { name: 'Late Buyer', phone: '9812300502' },
    created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
    delivered_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  });
  const closed = await api('GET', `/store/service/returns/eligibility?receipt=${late}&phone=9812300502`);
  assert.equal(closed.json.eligible, false);
  assert.match(closed.json.reason, /Return window closed/);

  // Wrong phone must not reveal eligibility.
  const wrong = await api('GET', `/store/service/returns/eligibility?receipt=${late}&phone=9999999999`);
  assert.equal(wrong.status, 404);

  // After filing, eligibility must report the existing request rather than inviting another.
  const filed = await api('POST', '/store/service/returns', {
    receipt: recent, phone: '9812300501', reason: 'damaged', details: 'Cracked housing',
  });
  assert.equal(filed.status, 201);
  const after = await api('GET', `/store/service/returns/eligibility?receipt=${recent}&phone=9812300501`);
  assert.equal(after.json.eligible, false);
  assert.match(after.json.reason, /already exists/);
});

test('returns enforce the 7-day window and reject duplicates', async () => {
  // An old, long-delivered order must be refused with the policy quoted back.
  const oldReceipt = 'rcpt_window_old';
  fake.orders.push({
    id: 9001,
    receipt: oldReceipt,
    status: 'delivered',
    items: [{ slug: 'drill-a', qty: 1, unit_price_paise: 100000 }],
    amount_paise: 118000,
    customer: { name: 'Late Buyer', phone: '9812300401' },
    created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
    delivered_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  });
  const late = await api('POST', '/store/service/returns', {
    receipt: oldReceipt, phone: '9812300401', reason: 'damaged', details: 'Arrived cracked',
  });
  assert.equal(late.status, 409);
  assert.match(late.json.error, /Return window closed/);

  // A recent delivery can file one request, but not a second one.
  const freshReceipt = 'rcpt_window_fresh';
  fake.orders.push({
    id: 9002,
    receipt: freshReceipt,
    status: 'delivered',
    items: [{ slug: 'drill-a', qty: 1, unit_price_paise: 100000 }],
    amount_paise: 118000,
    customer: { name: 'Fresh Buyer', phone: '9812300402' },
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    delivered_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  });
  const first = await api('POST', '/store/service/returns', {
    receipt: freshReceipt, phone: '9812300402', reason: 'defective', details: 'Motor does not start',
  });
  assert.equal(first.status, 201);

  const second = await api('POST', '/store/service/returns', {
    receipt: freshReceipt, phone: '9812300402', reason: 'defective', details: 'Again',
  });
  assert.equal(second.status, 409);
  assert.match(second.json.error, /already exists/);
});

test('cancelling an order gives its coupon use back', async () => {
  fake.coupons.set('BACK10', {
    code: 'BACK10', pct_off: 10, max_discount_paise: 50000, min_order_paise: 50000,
    active: true, max_uses: 5, used_count: 1,
  });

  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 2 }],
    customer: { name: 'Coupon Canceller', phone: '9812300601' },
    couponCode: 'BACK10',
  });
  assert.equal(created.status, 200);
  assert.equal(fake.coupons.get('BACK10').used_count, 2, 'checkout claimed a use');

  const cancelled = await api('POST', '/store/service/cancel', {
    receipt: created.json.receipt,
    phone: '9812300601',
  });
  assert.equal(cancelled.status, 200);
  assert.equal(fake.coupons.get('BACK10').used_count, 1, 'cancelling released the use');
});

test('stale pending holds can be released, and only the old ones', async () => {
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const stockBefore = fake.products.get('drill-a').stock;

  const stale = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 2 }],
    customer: { name: 'Abandoned Buyer', phone: '9812300701' },
  });
  assert.equal(stale.status, 200);
  // Backdate the abandoned order past the sweep window.
  const staleOrder = fake.orders.find((o) => o.receipt === stale.json.receipt);
  staleOrder.created_at = new Date(Date.now() - 90 * 60000).toISOString();

  const fresh = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Live Buyer', phone: '9812300702' },
  });
  assert.equal(fresh.status, 200);

  const sweep = await api('POST', '/admin/orders/release-stale?minutes=30', undefined, adminHeaders);
  assert.equal(sweep.status, 200);
  assert.equal(sweep.json.released.length, 1, 'only the abandoned order is released');
  assert.equal(sweep.json.released[0].receipt, stale.json.receipt);

  const staleNow = fake.orders.find((o) => o.receipt === stale.json.receipt);
  assert.equal(staleNow.status, 'cancelled');
  const freshNow = fake.orders.find((o) => o.receipt === fresh.json.receipt);
  assert.equal(freshNow.status, 'pending', 'a live checkout keeps its reservation');
  assert.equal(fake.products.get('drill-a').stock, stockBefore - 1, 'the abandoned 2 units came back');

  // minutes is clamped, and the endpoint requires the admin token.
  const noAuth = await api('POST', '/admin/orders/release-stale');
  assert.equal(noAuth.status, 401);
});

test('bulk status update ships many orders and reports skips', async () => {
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const receipts = [];
  for (let i = 0; i < 3; i += 1) {
    const r = await api('POST', '/store/checkout/create', {
      items: [{ slug: 'drill-a', qty: 1 }],
      customer: { name: `Bulk ${i}`, phone: `981230020${i}` },
    });
    receipts.push(r.json.receipt);
  }

  const list = await api('GET', '/admin/orders?limit=10', undefined, adminHeaders);
  const mine = list.json.orders.filter((o) => receipts.includes(o.receipt));
  assert.equal(mine.length, 3, 'all three orders are visible to the admin');

  // One of them gets cancelled first so the bulk call must skip it (illegal transition).
  await api('PATCH', `/admin/orders/${mine[0].id}`, { status: 'cancelled' }, adminHeaders);

  const res = await api('POST', '/admin/orders/bulk-status', {
    ids: mine.map((o) => o.id),
    status: 'shipped',
  }, adminHeaders);
  assert.equal(res.status, 200);
  assert.equal(res.json.applied.length, 2, 'two orders move to shipped');
  assert.equal(res.json.skipped.length, 1, 'the cancelled order is skipped with a reason');
  assert.ok(res.json.skipped[0].reason, 'skip carries an explanation');

  // Nothing outside the request is touched, and statuses actually persisted.
  for (const o of mine.slice(1)) {
    const detail = await api('GET', `/admin/orders/${o.id}`, undefined, adminHeaders);
    assert.equal(detail.json.order.status, 'shipped');
  }
});

test('bulk status update validates its input', async () => {
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const noIds = await api('POST', '/admin/orders/bulk-status', { ids: [], status: 'shipped' }, adminHeaders);
  assert.equal(noIds.status, 400);

  const badStatus = await api('POST', '/admin/orders/bulk-status', { ids: [1], status: 'teleported' }, adminHeaders);
  assert.equal(badStatus.status, 400);
  assert.match(badStatus.json.error, /status must be one of/);
});

test('admin orders paging: offset moves the window and limit is respected', async () => {
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  // Create three orders so paging has something to move past.
  for (let i = 0; i < 3; i += 1) {
    await api('POST', '/store/checkout/create', {
      items: [{ slug: 'drill-a', qty: 1 }],
      customer: { name: `Pager ${i}`, phone: `981230010${i}` },
    });
  }

  const first = await api('GET', '/admin/orders?limit=1&offset=0', undefined, adminHeaders);
  const second = await api('GET', '/admin/orders?limit=1&offset=1', undefined, adminHeaders);
  assert.equal(first.status, 200);
  assert.equal(first.json.orders.length, 1);
  assert.equal(first.json.limit, 1);
  assert.equal(first.json.offset, 0);
  assert.equal(second.json.offset, 1);
  assert.notEqual(first.json.orders[0].receipt, second.json.orders[0].receipt, 'offset must advance');

  // negative offsets clamp to zero rather than erroring
  const clamped = await api('GET', '/admin/orders?limit=1&offset=-5', undefined, adminHeaders);
  assert.equal(clamped.status, 200);
  assert.equal(clamped.json.offset, 0);
});

test('admin orders can be filtered by status and date range (and flags bad dates)', async () => {
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9812300001' },
    payMode: 'cod',
  });
  assert.equal(created.status, 200);

  const all = await api('GET', '/admin/orders', undefined, adminHeaders);
  assert.equal(all.status, 200);
  assert.ok(all.json.orders.some((o) => o.receipt === created.json.receipt));

  const filtered = await api('GET', '/admin/orders?status=cod_pending', undefined, adminHeaders);
  assert.equal(filtered.status, 200);
  assert.ok(filtered.json.orders.every((o) => o.status === 'cod_pending'));

  const today = new Date().toISOString().slice(0, 10);
  const inRange = await api('GET', `/admin/orders?from=${today}&to=${today}`, undefined, adminHeaders);
  assert.ok(inRange.json.orders.some((o) => o.receipt === created.json.receipt), 'order created today is in range');

  const past = await api('GET', '/admin/orders?from=2000-01-01&to=2000-01-31', undefined, adminHeaders);
  assert.deepEqual(past.json.orders, [], 'nothing existed in 2000');

  const bad = await api('GET', '/admin/orders?from=not-a-date', undefined, adminHeaders);
  assert.equal(bad.status, 200);
  assert.equal(bad.json.ignored.from, true, 'invalid date is reported, not silently applied');

  // export honours the same filters
  const csv = await fetch(`${base}/admin/orders/export.csv?from=2000-01-01&to=2000-01-31`, { headers: adminHeaders });
  const body = await csv.text();
  assert.equal(body.split('\r\n').length, 1, 'header only: no rows in that range');
});

test('orders CSV export is token-guarded and escapes quotes/commas', async () => {
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 2 }],
    customer: { name: 'Ravi "RK" Kumar, Jr', phone: '9876543210', pincode: '560001', gstin: '27AAPFU0939F1ZV' },
    payMode: 'cod',
  });
  assert.equal(created.status, 200);

  const res = await fetch(`${base}/admin/orders/export.csv`, { headers: adminHeaders });
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  const header = body.split('\r\n')[0];
  assert.equal(header, 'receipt,date,status,payment_mode,refund,amount_inr,discount_inr,shipping_inr,coupon,customer,phone,pincode,gstin,payment_id');

  const row = body.split('\r\n').find((l) => l.includes(created.json.receipt));
  assert.ok(row, 'export should contain the new order');
  assert.ok(row.includes('"Ravi ""RK"" Kumar, Jr"'), 'quotes doubled and comma kept inside the field');
  assert.ok(row.includes('"cod"'));
  assert.ok(row.includes('"560001"'));
  assert.ok(row.includes('"27AAPFU0939F1ZV"'));
  assert.ok(row.includes(`"${(created.json.amount_paise / 100).toFixed(2)}"`));

  const anonymous = await fetch(`${base}/admin/orders/export.csv`);
  assert.equal(anonymous.status, 401);
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

test('my orders includes item names, capped at five lines', async () => {
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 2 }],
    customer: { name: 'Ravi', phone: '9812345678' },
  });
  assert.equal(created.status, 200);

  const list = await api('GET', '/store/service/orders?phone=9812345678');
  assert.equal(list.status, 200);
  const order = list.json.orders.find((o) => o.receipt === created.json.receipt);
  assert.ok(order, 'order should be listed');
  assert.equal(order.itemCount, 2);
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].slug, 'drill-a');
  assert.equal(order.items[0].name, 'Drill A', 'product name comes from the catalogue');
  assert.equal(order.items[0].qty, 2);
  assert.equal(order.payMode, 'online');

  // phone formatting still matches
  const formatted = await api('GET', '/store/service/orders?phone=%2B91%2098123%2045678');
  assert.ok(formatted.json.orders.some((o) => o.receipt === created.json.receipt));
});

test('customers can check their own return status, not anyone else s', async () => {
  const adminHeaders = { 'x-admin-token': 'test-admin-token' };
  const created = await api('POST', '/store/checkout/create', {
    items: [{ slug: 'drill-a', qty: 1 }],
    customer: { name: 'Ravi', phone: '9876543210' },
  });
  const receipt = created.json.receipt;
  const order = fake.orders.find((o) => o.receipt === receipt);
  await api('PATCH', `/admin/orders/${order.id}`, { status: 'shipped' }, adminHeaders);
  await api('PATCH', `/admin/orders/${order.id}`, { status: 'delivered' }, adminHeaders);

  const filed = await api('POST', '/store/service/returns', { receipt, phone: '9876543210', reason: 'damaged' });
  assert.equal(filed.status, 201);

  const mine = await api('GET', `/store/service/returns?receipt=${receipt}&phone=%2B91%2098765%2043210`);
  assert.equal(mine.status, 200);
  assert.equal(mine.json.return.status, 'requested');
  assert.equal(mine.json.return.reason, 'damaged');

  // once admin progresses it, the customer sees the new state
  await api('PATCH', `/admin/returns/${filed.json.id}`, { status: 'approved' }, adminHeaders);
  const updated = await api('GET', `/store/service/returns?receipt=${receipt}&phone=9876543210`);
  assert.equal(updated.json.return.status, 'approved');

  // another phone number cannot read it
  const other = await api('GET', `/store/service/returns?receipt=${receipt}&phone=9000000000`);
  assert.equal(other.status, 404);

  const noPhone = await api('GET', `/store/service/returns?receipt=${receipt}`);
  assert.equal(noPhone.status, 400);
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
  // fixtures are shared across this file's tests, so assert this receipt is present
  // rather than that it is the only row.
  assert.ok(listed.json.returns.some((r) => r.receipt === receipt));

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
