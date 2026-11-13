// Fixture backend for local end-to-end checks.
//
// Serves the REAL catalogue/taxonomy/state data from apps/backend/data with the same response
// shapes as the Express API, so `smoke.mjs` and `audit-pages.mjs` can run against realistic
// pages without Postgres, Docker or Razorpay keys. Numbers/money are held in paise exactly as
// the API does.
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.join(HERE, '..', 'apps', 'backend');

const productsMod = require(path.join(BACKEND, 'data', 'products.js'));
const PRODUCTS = Array.isArray(productsMod) ? productsMod : productsMod.products;
const { CATEGORIES, resolveCategory } = require(path.join(BACKEND, 'data', 'categories.js'));
const { STATES } = require(path.join(BACKEND, 'data', 'states.js'));

const PORT = Number(process.env.FIXTURE_PORT) || 9100;
const GST_RATE = 18;

function withRupee(product) {
  return {
    ...product,
    price: Math.round((product.price_paise || 0) / 100),
    mrp: Math.round((product.mrp_paise || 0) / 100),
    image: (product.images && product.images[0]) || '',
    id: product.slug,
  };
}

function matchesCategory(p, category) {
  if (!category || category === 'all') return true;
  const resolved = resolveCategory(category);
  if (resolved && resolved.child) return p.subcategory === resolved.child.slug;
  if (resolved) return p.category === resolved.parent.slug;
  return p.category === category;
}

function listProducts(query) {
  const q = String(query.get('q') || '').toLowerCase().trim();
  const brand = query.get('brand') || '';
  const limit = Math.min(Number(query.get('limit')) || 20, 100);
  const offset = Math.max(0, Number(query.get('offset')) || 0);
  const minPrice = Number(query.get('minPrice')) * 100 || 0;
  const maxPrice = Number(query.get('maxPrice')) * 100 || 0;

  let rows = PRODUCTS.filter((p) => matchesCategory(p, query.get('category') || ''));
  if (query.get('subcategory')) rows = rows.filter((p) => p.subcategory === query.get('subcategory'));
  if (brand && brand !== 'All') rows = rows.filter((p) => p.brand.toLowerCase() === brand.toLowerCase());
  if (q) rows = rows.filter((p) => `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(q));
  if (minPrice) rows = rows.filter((p) => p.price_paise >= minPrice);
  if (maxPrice) rows = rows.filter((p) => p.price_paise <= maxPrice);

  const sort = query.get('sort') || 'pop';
  if (sort === 'asc') rows.sort((a, b) => a.price_paise - b.price_paise);
  else if (sort === 'desc') rows.sort((a, b) => b.price_paise - a.price_paise);
  else if (sort === 'off') rows.sort((a, b) => (b.mrp_paise - b.price_paise) - (a.mrp_paise - a.price_paise));

  const total = rows.length;
  return { products: rows.slice(offset, offset + limit).map(withRupee), total };
}

function categoryTree() {
  return CATEGORIES.map((parent) => {
    const inParent = PRODUCTS.filter((p) => p.category === parent.slug);
    return {
      slug: parent.slug,
      label: parent.label,
      path: parent.slug,
      count: inParent.length,
      children: parent.children.map((child) => ({
        slug: child.slug,
        label: child.label,
        path: `${parent.slug}/${child.slug}`,
        count: inParent.filter((p) => p.subcategory === child.slug).length,
      })),
    };
  });
}

function invoiceFor(receipt) {
  const items = [withRupee(PRODUCTS[0])].map((p) => ({
    slug: p.slug, name: p.name, hsn: p.hsn, qty: 1, unitPaise: p.price_paise, linePaise: p.price_paise,
  }));
  const grandPaise = items.reduce((s, it) => s + it.linePaise, 0);
  const base = Math.round((grandPaise * 100) / (100 + GST_RATE));
  return {
    receipt,
    createdAt: '2026-05-20T10:00:00.000Z',
    status: 'paid',
    couponCode: null,
    payMode: 'online',
    discountPaise: 0,
    itemsTotalPaise: grandPaise,
    shippingPaise: 0,
    customer: {
      name: 'Fixture Buyer', phone: '9876543210', address: '12 Industrial Estate',
      pincode: '411001', gstin: '', state: 'Maharashtra', stateCode: '27',
    },
    items,
    subtotalPaise: base,
    gst: { rate: GST_RATE, base, gst: grandPaise - base },
    grandPaise,
    razorpayPaymentId: 'pay_fixture',
  };
}

function sitemapXml() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://shop.test';
  const urls = [
    '/', '/deals', '/brands', '/bulk-quote', '/bulk-orders', '/emi-options', '/contact-us',
    '/about-us', '/shipping-policy', '/returns-policy', '/cancellation-policy',
    '/warranty-policy', '/privacy-policy', '/terms-conditions', '/category/all',
    ...CATEGORIES.flatMap((c) => [`/category/${c.slug}`, ...c.children.map((k) => `/category/${c.slug}/${k.slug}`)]),
    ...PRODUCTS.map((p) => `/product/${p.slug}`),
    ...['Bosch', 'CRI', 'Kirloskar'].map((b) => `/brand/${encodeURIComponent(b)}`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join('\n') + '\n</urlset>';
}

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'fixture-admin-token';
// Only this receipt has an invoice. Anything else must 404 exactly like the real API, so the
// live smoke can assert both the working invoice and the unknown-receipt 404.
const FIXTURE_RECEIPT = process.env.FIXTURE_RECEIPT || 'rcpt_fixture';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture');
  const p = url.pathname;
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'Content-Type': type });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  if (p === '/health') return send(200, { ok: true });
  if (p === '/ready') return send(200, { ok: true });
  if (p === '/sitemap.xml') return send(200, sitemapXml(), 'application/xml');

  if (p === '/store/categories') return send(200, { categories: categoryTree() });
  if (p === '/store/states') return send(200, { states: STATES });

  if (p === '/store/products') return send(200, listProducts(url.searchParams));
  if (p.startsWith('/store/products/')) {
    const slug = decodeURIComponent(p.split('/').pop());
    const found = PRODUCTS.find((x) => x.slug === slug);
    return found ? send(200, { product: withRupee(found) }) : send(404, { error: 'Not found' });
  }

  if (p === '/store/brands') {
    const counts = new Map();
    for (const x of PRODUCTS) counts.set(x.brand, (counts.get(x.brand) || 0) + 1);
    return send(200, { brands: [...counts].map(([name, count]) => ({ name, count })) });
  }

  if (p === '/store/deals') {
    const deals = PRODUCTS.filter((x) => x.mrp_paise > x.price_paise)
      .map((x) => ({ ...withRupee(x), off: Math.round(((x.mrp_paise - x.price_paise) / x.mrp_paise) * 100) }));
    return send(200, { deals, total: deals.length });
  }

  if (p === '/store/search') return send(200, listProducts(url.searchParams));
  if (p === '/store/search/suggest') return send(200, { suggestions: [] });

  if (p === '/store/engage') return send(200, { reviews: [], avg: 0, count: 0, questions: [] });
  if (p === '/store/engage/reviews' || p === '/store/engage/questions') return send(200, { ok: true });

  if (p === '/store/service/pincode') {
    return send(200, { serviceable: true, etaDays: 4, codAvailable: true, codMaxPaise: 2000000, zone: 'metro' });
  }
  if (p === '/store/service/stock') return send(200, { stock: {} });
  if (p === '/store/service/returns/eligibility') return send(200, { eligible: false, reason: 'Fixture' });
  if (p.startsWith('/store/invoice/')) {
    const receipt = decodeURIComponent(p.split('/').pop());
    if (!receipt) return send(400, { error: 'receipt required' });
    if (receipt !== FIXTURE_RECEIPT) return send(404, { error: 'Order not found' });
    return send(200, invoiceFor(receipt));
  }
  if (p.startsWith('/store/')) return send(200, { ok: true });

  if (p.startsWith('/webhooks/')) return send(200, { ok: true });

  if (p.startsWith('/admin/')) {
    if ((req.headers['x-admin-token'] || '') !== ADMIN_TOKEN) return send(401, { error: 'Unauthorized' });
    if (p === '/admin/stats') {
      return send(200, { ordersByStatus: {}, ordersToday: 0, revenuePaise: 0, lowStock: [], quotesNew: 0, manualRefunds: 0 });
    }
    return send(200, { orders: [], quotes: [], returns: [], messages: [], subscribers: [], alerts: [], reviews: [], questions: [], coupons: [], products: [] });
  }

  send(404, { error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[fixture] backend on http://127.0.0.1:${PORT} (${PRODUCTS.length} products)`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { server.close(() => process.exit(0)); });
}
