// Server-side data helpers (used by metadata/layouts). Never throws: metadata must not
// break a page when the API is briefly unavailable.
const BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:9000').replace(/\/+$/, '');

async function safeJson(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getProductForMeta(slug) {
  const data = await safeJson(`${BASE}/store/products/${encodeURIComponent(slug)}`);
  if (!data) return null;
  const p = data.product || data;
  return p && p.name ? p : null;
}

export async function getProductsForMeta(category, limit = 8) {
  const budget = category && category !== 'all' ? `&category=${encodeURIComponent(category)}` : '';
  const data = await safeJson(`${BASE}/store/products?limit=${limit}${budget}`);
  if (!data) return [];
  return Array.isArray(data) ? data : data.products || [];
}

export function paiseToRupees(paise) {
  return Math.round(Number(paise || 0) / 100);
}

export function absoluteUrl(path) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  return `${base}${path}`;
}
