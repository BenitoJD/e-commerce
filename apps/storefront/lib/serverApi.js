// Server-side data helpers (used by SSR pages and metadata). Never throws: metadata must
// not break a page when the API is briefly unavailable.
//
// A short TTL cache absorbs bursts (a WhatsApp share, a crawl) so Postgres isn't hit once
// per request. Ten seconds keeps prices/stock effectively live while cutting load.
import { serverApiBase } from './serverApiBase';
import { createTtlCache } from './ttlCache';

const BASE = serverApiBase();
const TTL_MS = Number(process.env.SSR_CACHE_TTL_MS) || 10000;
const cache = createTtlCache({ ttlMs: TTL_MS, max: 500 });

async function safeJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function cachedJson(url) {
  return cache.wrap(url, () => safeJson(url));
}

export async function getProductForMeta(slug) {
  const data = await cachedJson(`${BASE}/store/products/${encodeURIComponent(slug)}`);
  if (!data) return null;
  const p = data.product || data;
  return p && p.name ? p : null;
}

export async function getProductsForMeta(category, limit = 8) {
  const page = await getProductsPage(category, limit);
  return page.items;
}

// First page + the true match count, for pages that render a result total.
export async function getProductsPage(category, limit = 40) {
  const budget = category && category !== 'all' ? `&category=${encodeURIComponent(category)}` : '';
  const data = await cachedJson(`${BASE}/store/products?limit=${limit}${budget}`);
  if (!data) return { items: [], total: null };
  const items = Array.isArray(data) ? data : data.products || [];
  const total = !Array.isArray(data) && Number.isFinite(Number(data.total)) ? Number(data.total) : null;
  return { items, total };
}

export async function getRatingForMeta(slug) {
  const data = await cachedJson(`${BASE}/store/engage/reviews/${encodeURIComponent(slug)}`);
  if (!data) return null;
  const count = Number(data.count) || 0;
  const avg = Number(data.avg) || 0;
  return count > 0 ? { avg, count } : null;
}

// Brand directory straight from SQL aggregation — never truncates at one product page.
export async function getBrandsForMeta() {
  const data = await cachedJson(`${BASE}/store/brands`);
  if (!data) return [];
  return Array.isArray(data.brands) ? data.brands : [];
}

// Discounted products straight from SQL (never truncated to the first product page).
export async function getDealsForMeta(minOff = 20, limit = 60) {
  const q = new URLSearchParams({ minOff: String(minOff), limit: String(limit) });
  const data = await cachedJson(`${BASE}/store/deals?${q.toString()}`);
  if (!data) return [];
  return Array.isArray(data.deals) ? data.deals : [];
}

// Products for one brand via the search endpoint's brand filter, plus the true total so
// the page can show an accurate count and know whether more pages exist.
export async function getBrandPage(name, limit = 40) {
  const q = new URLSearchParams({ brand: String(name || ''), limit: String(limit) });
  const data = await cachedJson(`${BASE}/store/search?${q.toString()}`);
  if (!data) return { items: [], total: null };
  const items = Array.isArray(data) ? data : data.products || [];
  const total = !Array.isArray(data) && Number.isFinite(Number(data.total)) ? Number(data.total) : null;
  return { items, total };
}

export async function getBrandProducts(name, limit = 48) {
  return (await getBrandPage(name, limit)).items;
}

export function paiseToRupees(paise) {
  return Math.round(Number(paise || 0) / 100);
}

export function absoluteUrl(path) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  return `${base}${path}`;
}

// Exposed for tests / operational resets.
export const __cache = cache;
