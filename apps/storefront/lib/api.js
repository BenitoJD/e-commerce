const BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:9000').replace(/\/$/, '');

// A bundle built with a localhost API URL works in dev and fails silently in
// production (browser tries the visitor's own machine). Surface it loudly instead.
export function detectMisconfiguredBase(base, hostname) {
  const b = String(base || '');
  const host = String(hostname || '');
  const baseIsLocal = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/i.test(b);
  const pageIsLocal = !host || /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(host);
  if (baseIsLocal && !pageIsLocal) {
    return `API base "${b}" points at localhost but the site is served from ${host}. Set NEXT_PUBLIC_BACKEND_URL to your domain (e.g. https://${host}/api) and rebuild.`;
  }
  return null;
}

if (typeof window !== 'undefined') {
  const problem = detectMisconfiguredBase(BASE, window.location && window.location.hostname);
  // eslint-disable-next-line no-console
  if (problem) console.error(`[storefront] ${problem}`);
}

// Turn a failed response body into a message a shopper can actually read.
// Backend returns {"error": "..."} — show that, never a raw JSON/HTML dump.
export function parseErrorMessage(status, bodyText) {
  const raw = String(bodyText == null ? '' : bodyText).trim();
  if (raw) {
    try {
      const data = JSON.parse(raw);
      const msg = data && (data.error || data.message);
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    } catch { /* not JSON: fall through */ }
    if (!raw.startsWith('<') && !raw.startsWith('{')) return raw.slice(0, 160);
  }
  if (status === 401 || status === 403) return 'You are not authorised to do that.';
  if (status === 404) return 'Not found.';
  if (status === 429) return 'Too many requests — please wait a moment.';
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  return `Request failed (${status}).`;
}

async function handle(res) {
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(parseErrorMessage(res.status, t));
  }
  return res.json();
}

export function backendUrl() { return BASE; }

// Backend stores money in paise (price_paise/mrp_paise); UI reads rupees (price/mrp).
// Normalize once here so every page works with either shape.
export function normalizeProduct(p) {
  if (!p || typeof p !== 'object') return p;
  const hasPaise = p.price_paise != null || p.mrp_paise != null;
  const hasPrice = p.price != null || p.mrp != null || p.image != null || p.images != null;
  if (!hasPaise && !hasPrice) return p;
  const out = { ...p };
  if (out.price == null && out.price_paise != null) out.price = Math.round(Number(out.price_paise) / 100);
  if (out.mrp == null && out.mrp_paise != null) out.mrp = Math.round(Number(out.mrp_paise) / 100);
  if (!out.image && Array.isArray(out.images) && out.images[0]) out.image = out.images[0];
  if (out.id == null && out.slug) out.id = out.slug;
  return out;
}

export function normalizeList(list) {
  return (Array.isArray(list) ? list : []).map(normalizeProduct);
}

// Only known embed hosts may reach an <iframe src>. Blocks javascript:/data: injection
// from any untrusted product payload.
const SAFE_EMBED = /^https:\/\/(www\.)?(youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/|vimeo\.com\/)/;

export function safeVideoUrls(list) {
  return (Array.isArray(list) ? list : [])
    .filter((v) => SAFE_EMBED.test(String(v == null ? '' : v).trim()))
    .map((v) => String(v).trim());
}

export async function fetchProducts({ category, limit = 20, search = '', brand = '', sort = '', offset = 0, minPrice = '', maxPrice = '' } = {}) {
  const q = new URLSearchParams();
  if (limit) q.set('limit', String(limit));
  if (offset) q.set('offset', String(offset));
  if (category && category !== 'all') q.set('category', category);
  if (search) q.set('q', search);
  if (brand && brand !== 'All') q.set('brand', brand);
  if (sort && sort !== 'pop') q.set('sort', sort);
  if (minPrice !== '' && minPrice != null) q.set('minPrice', String(minPrice));
  if (maxPrice !== '' && maxPrice != null) q.set('maxPrice', String(maxPrice));
  const res = await fetch(`${BASE}/store/products?${q.toString()}`, { cache: 'no-store' });
  const data = await handle(res);
  if (Array.isArray(data)) return normalizeList(data);
  if (data && Array.isArray(data.products)) return { ...data, products: normalizeList(data.products) };
  if (data && Array.isArray(data.items)) return { ...data, items: normalizeList(data.items) };
  return data;
}

export async function fetchBrands() {
  const res = await fetch(`${BASE}/store/brands`, { cache: 'no-store' });
  return handle(res);
}

export async function suggestSearch(q, signal) {
  const params = new URLSearchParams({ q: String(q || '') });
  const res = await fetch(`${BASE}/store/search/suggest?${params.toString()}`, { cache: 'no-store', signal });
  return handle(res);
}

export async function fetchStock(slugs) {
  const list = (Array.isArray(slugs) ? slugs : []).filter(Boolean);
  if (!list.length) return { stock: {} };
  const q = new URLSearchParams({ slugs: list.join(',') });
  const res = await fetch(`${BASE}/store/products/stock?${q.toString()}`, { cache: 'no-store' });
  return handle(res);
}

export async function fetchProduct(slug) {
  const res = await fetch(`${BASE}/store/products/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  const data = await handle(res);
  if (data && data.product) return { ...data, product: normalizeProduct(data.product) };
  return normalizeProduct(data);
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
  const body = { ...(payload || {}) };
  // Backend resolves product_slug; also forward free-text product/product_name.
  if (body.product && !body.product_slug) body.product_slug = body.product;
  const res = await fetch(`${BASE}/store/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  return handle(res);
}

export async function getReturnStatus(receipt, phone) {
  const q = new URLSearchParams({ receipt: String(receipt || '').trim(), phone: String(phone || '').trim() });
  const res = await fetch(`${BASE}/store/service/returns?${q.toString()}`, { cache: 'no-store' });
  return handle(res);
}

export async function getMyQuotes(phone) {
  const q = new URLSearchParams({ phone: String(phone || '').trim() });
  const res = await fetch(`${BASE}/store/quotes?${q.toString()}`, { cache: 'no-store' });
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

export async function getAdminOrders(token, status = '', search = '', { from = '', to = '', offset = 0, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (search) params.set('q', search);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (offset) params.set('offset', String(offset));
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  const res = await fetch(`${BASE}/admin/orders${qs ? `?${qs}` : ''}`, {
    headers: adminHeaders(token),
    cache: 'no-store'
  });
  return handle(res);
}

// CSV downloads need the token, so the browser can't just link to the URL — fetch it
// with headers and hand back the text for a Blob download.
export async function releaseStaleHolds(token, minutes = 30) {
  const res = await fetch(`${BASE}/admin/orders/release-stale?minutes=${encodeURIComponent(minutes)}`, {
    method: 'POST',
    headers: adminHeaders(token),
  });
  return handle(res);
}

export async function bulkUpdateOrderStatus(token, ids, status) {
  const res = await fetch(`${BASE}/admin/orders/bulk-status`, {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ ids, status }),
  });
  return handle(res);
}

export async function getAdminOrdersCsv(token, status = '', { from = '', to = '' } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${BASE}/admin/orders/export.csv${q}`, {
    headers: adminHeaders(token),
    cache: 'no-store'
  });
  if (!res.ok) {
    const msg = await parseErrorMessage(res);
    throw new Error(msg);
  }
  return res.text();
}

export async function getAdminOrderDetail(token, id) {
  const res = await fetch(`${BASE}/admin/orders/${encodeURIComponent(id)}`, {
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

export async function convertQuote(token, id, unitPricePaise) {
  const res = await fetch(`${BASE}/admin/quotes/${encodeURIComponent(id)}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders(token) },
    body: JSON.stringify(unitPricePaise ? { unit_price_paise: Number(unitPricePaise) } : {}),
    cache: 'no-store'
  });
  return handle(res);
}

export async function listCoupons(token) {
  const res = await fetch(`${BASE}/admin/coupons`, { headers: adminHeaders(token), cache: 'no-store' });
  return handle(res);
}

export async function saveCoupon(token, payload) {
  const res = await fetch(`${BASE}/admin/coupons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders(token) },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });
  return handle(res);
}

export async function toggleCoupon(token, code, active) {
  const res = await fetch(`${BASE}/admin/coupons/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...adminHeaders(token) },
    body: JSON.stringify({ active }),
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

// ---- Engage: reviews ----
export async function getReviews(slug) {
  const res = await fetch(`${BASE}/store/engage/reviews/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  return handle(res);
}

export async function addReview(slug, { name, rating, title, body }) {
  const res = await fetch(`${BASE}/store/engage/reviews/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, rating: Number(rating), title, body }),
    cache: 'no-store'
  });
  return handle(res);
}

// ---- Engage: Q&A ----
export async function getQuestions(slug) {
  const res = await fetch(`${BASE}/store/engage/questions/${encodeURIComponent(slug)}`, { cache: 'no-store' });
  return handle(res);
}

export async function addQuestion(slug, payload) {
  const body = typeof payload === 'string' ? { name: 'Guest', question: payload } : payload;
  const res = await fetch(`${BASE}/store/engage/questions/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  return handle(res);
}

// ---- Engage: coupons ----
export async function validateCoupon(code, amountPaise) {
  const q = new URLSearchParams({ code: code || '', amount_paise: String(amountPaise || 0) });
  const res = await fetch(`${BASE}/store/engage/coupons/validate?${q.toString()}`, { cache: 'no-store' });
  return handle(res);
}

// ---- Service: pincode ----
export async function checkPincode(code, amountPaise = null) {
  const params = new URLSearchParams();
  const amount = Number(amountPaise);
  if (Number.isFinite(amount) && amount > 0) params.set('amount_paise', String(Math.round(amount)));
  const qs = params.toString();
  const res = await fetch(`${BASE}/store/service/pincode/${encodeURIComponent(code)}${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  return handle(res);
}

// ---- Service: order tracking ----
export async function trackOrder(receipt, phone) {
  const q = new URLSearchParams({ receipt: receipt || '', phone: phone || '' });
  const res = await fetch(`${BASE}/store/service/track?${q.toString()}`, { cache: 'no-store' });
  return handle(res);
}

// ---- Service: newsletter ----
export async function sendContactMessage(payload) {
  const res = await fetch(`${BASE}/store/service/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });
  return handle(res);
}

export async function getAdminMessages(token, status = '') {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${BASE}/admin/contact${q}`, { headers: adminHeaders(token), cache: 'no-store' });
  return handle(res);
}

export async function updateMessageStatus(token, id, status) {
  const res = await fetch(`${BASE}/admin/contact/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...adminHeaders(token) },
    body: JSON.stringify({ status }),
    cache: 'no-store'
  });
  return handle(res);
}

export async function getAdminReviews(token, verified = '', limit = 50) {
  const q = new URLSearchParams();
  if (verified) q.set('verified', verified);
  if (limit) q.set('limit', String(limit));
  const res = await fetch(`${BASE}/admin/reviews?${q.toString()}`, { headers: adminHeaders(token), cache: 'no-store' });
  return handle(res);
}

export async function setReviewVerified(token, id, verified) {
  const res = await fetch(`${BASE}/admin/reviews/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...adminHeaders(token) },
    body: JSON.stringify({ verified }),
    cache: 'no-store'
  });
  return handle(res);
}

export async function deleteReview(token, id) {
  const res = await fetch(`${BASE}/admin/reviews/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
    cache: 'no-store'
  });
  return handle(res);
}

export async function listAdminQuestions(token, answered = '', limit = 100) {
  const q = new URLSearchParams();
  if (answered) q.set('answered', answered);
  if (limit) q.set('limit', String(limit));
  const res = await fetch(`${BASE}/admin/questions?${q.toString()}`, { headers: adminHeaders(token), cache: 'no-store' });
  return handle(res);
}

export async function deleteQuestion(token, id) {
  const res = await fetch(`${BASE}/admin/questions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
    cache: 'no-store'
  });
  return handle(res);
}

export async function answerQuestion(token, id, answer) {
  const res = await fetch(`${BASE}/store/engage/answers/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders(token) },
    body: JSON.stringify({ answer }),
    cache: 'no-store'
  });
  return handle(res);
}

export async function subscribe(email) {
  const res = await fetch(`${BASE}/store/service/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    cache: 'no-store'
  });
  return handle(res);
}

// ---- Search (contract endpoint) with fallback to /store/products ----
export async function searchProducts({ q = '', brand = '', category = '', maxPrice = '', sort = '', limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (brand) params.set('brand', brand);
  if (category) params.set('category', category);
  if (maxPrice) params.set('maxPrice', String(maxPrice));
  if (sort) params.set('sort', sort);
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  try {
    const res = await fetch(`${BASE}/store/search?${params.toString()}`, { cache: 'no-store' });
    const data = await handle(res);
    const list = normalizeList(Array.isArray(data) ? data : data.products || data.items || []);
    if (list.length) return list;
  } catch {
    // fall through to legacy endpoint
  }
  return fetchProducts({ category: category || undefined, limit, search: q, brand, sort, offset });
}

export function asList(data) {
  if (Array.isArray(data)) return normalizeList(data);
  if (data && Array.isArray(data.products)) return normalizeList(data.products);
  if (data && Array.isArray(data.items)) return normalizeList(data.items);
  return [];
}

// ---- Service: my orders / cancel / invoice ----
export async function getMyOrders(phone) {
  const q = new URLSearchParams({ phone: phone || '' });
  const res = await fetch(`${BASE}/store/service/orders?${q.toString()}`, { cache: 'no-store' });
  return handle(res);
}

export async function cancelOrder(receipt, phone) {
  const res = await fetch(`${BASE}/store/service/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receipt, phone }),
    cache: 'no-store'
  });
  return handle(res);
}

export async function stockAlert(slug, email) {
  const res = await fetch(`${BASE}/store/service/stock-alert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, email }),
    cache: 'no-store'
  });
  return handle(res);
}

export async function getAdminStockAlerts(token, slug = '') {
  const q = slug ? `?slug=${encodeURIComponent(slug)}` : '';
  const res = await fetch(`${BASE}/admin/stock-alerts${q}`, { headers: adminHeaders(token), cache: 'no-store' });
  return handle(res);
}

export async function getStates() {
  const res = await fetch(`${BASE}/store/states`, { cache: 'no-store' });
  return handle(res);
}

export async function checkReturnEligibility(receipt, phone) {
  const q = new URLSearchParams({ receipt: String(receipt || ''), phone: String(phone || '') });
  const res = await fetch(`${BASE}/store/service/returns/eligibility?${q.toString()}`, { cache: 'no-store' });
  return handle(res);
}

export async function requestReturn(payload) {  const res = await fetch(`${BASE}/store/service/returns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });
  return handle(res);
}

export async function saveAdminProduct(token, payload) {
  const res = await fetch(`${BASE}/admin/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...adminHeaders(token) },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });
  return handle(res);
}

export async function deleteAdminProduct(token, slug) {
  const res = await fetch(`${BASE}/admin/products/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
    cache: 'no-store'
  });
  return handle(res);
}


export async function getAdminSubscribers(token) {
  const res = await fetch(`${BASE}/admin/subscribers`, { headers: adminHeaders(token), cache: 'no-store' });
  return handle(res);
}

export async function getAdminReturns(token, status = '') {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${BASE}/admin/returns${q}`, { headers: adminHeaders(token), cache: 'no-store' });
  return handle(res);
}

export async function updateReturnStatus(token, id, status) {
  const res = await fetch(`${BASE}/admin/returns/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...adminHeaders(token) },
    body: JSON.stringify({ status }),
    cache: 'no-store'
  });
  return handle(res);
}

export async function getInvoice(receipt) {
  const res = await fetch(`${BASE}/store/invoice/${encodeURIComponent(receipt)}`, { cache: 'no-store' });
  return handle(res);}
