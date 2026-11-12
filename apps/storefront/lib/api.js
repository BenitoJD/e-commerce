const BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:9000').replace(/\/$/, '');

async function handle(res) {
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Backend ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

export function backendUrl() { return BASE; }

export async function fetchProducts({ category, limit = 20, search = '', brand = '', sort = '' } = {}) {
  const q = new URLSearchParams();
  if (limit) q.set('limit', String(limit));
  if (category && category !== 'all') q.set('category', category);
  if (search) q.set('q', search);
  if (search) q.set('search', search);
  if (brand) q.set('brand', brand);
  if (sort) q.set('sort', sort);
  const res = await fetch(`${BASE}/store/products?${q.toString()}`, { cache: 'no-store' });
  return handle(res);
}

export async function fetchProduct(slug) {
  const res = await fetch(`${BASE}/store/products/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  return handle(res);
}

export async function createCheckout(payload) {
  const res = await fetch(`${BASE}/store/checkout/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });
  return handle(res);
}

export async function createQuote(payload) {
  const res = await fetch(`${BASE}/store/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });
  return handle(res);
}

export async function verifyOrder(receipt) {
  const res = await fetch(`${BASE}/store/checkout/verify?receipt=${encodeURIComponent(receipt)}`, { cache: 'no-store' });
  return handle(res);
}

export function adminHeaders(token) {
  return { 'x-admin-token': token || '' };
}

export async function getAdminStats(token) {
  const res = await fetch(`${BASE}/admin/stats`, {
    headers: adminHeaders(token),
    cache: 'no-store'
  });
  return handle(res);
}

export async function getAdminOrders(token, status = '') {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${BASE}/admin/orders${q}`, {
    headers: adminHeaders(token),
    cache: 'no-store'
  });
  return handle(res);
}

export async function updateOrderStatus(token, id, status) {
  const res = await fetch(`${BASE}/admin/orders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...adminHeaders(token) },
    body: JSON.stringify({ status }),
    cache: 'no-store'
  });
  return handle(res);
}

export async function getAdminQuotes(token, status = '') {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${BASE}/admin/quotes${q}`, {
    headers: adminHeaders(token),
    cache: 'no-store'
  });
  return handle(res);
}

export async function updateQuoteStatus(token, id, status) {
  const res = await fetch(`${BASE}/admin/quotes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...adminHeaders(token) },
    body: JSON.stringify({ status }),
    cache: 'no-store'
  });
  return handle(res);
}

export async function updateStock(token, slug, stock) {
  const res = await fetch(`${BASE}/admin/products/${encodeURIComponent(slug)}/stock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...adminHeaders(token) },
    body: JSON.stringify({ stock: Number(stock) }),
    cache: 'no-store'
  });
  return handle(res);
}
