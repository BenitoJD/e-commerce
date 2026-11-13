// Runs once before the browser suite. The suite places real orders and decrements stock;
// repeated local runs would otherwise exhaust a SKU and fail with a misleading "out of
// stock" assertion. Top the test SKUs back up and make sure the seeded coupons exist.
const { API, ADMIN_TOKEN, P } = require('./helpers');

async function request(path, { method = 'GET', body, token } = {}) {
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

module.exports = async function globalSetup() {
  const health = await request('/health');
  if (health.status !== 200) throw new Error('Backend is not running on ' + API);

  // Remove catalogue entries left behind by earlier product-CRUD runs so the public
  // catalogue stays exactly at the seeded 30 and count assertions remain meaningful.
  try {
    const all = await request('/store/products?limit=100');
    const stale = (all.json?.products || []).filter((p) => String(p.slug).startsWith('e2e-product-'));
    for (const p of stale) await request(`/admin/products/${p.slug}`, { method: 'DELETE', token: ADMIN_TOKEN });
  } catch { /* non-fatal */ }

  for (const slug of [P.grinder, P.drill, P.router, P.washer, P.scrubber]) {
    const current = await request(`/store/products/${slug}`);
    const stock = Number(current.json?.product?.stock ?? 0);
    if (stock < 40) {
      const r = await request(`/admin/products/${slug}/stock`, { method: 'PATCH', body: { stock: 50 }, token: ADMIN_TOKEN });
      if (r.status !== 200) throw new Error(`could not top up ${slug}: ${r.status} ${r.text}`);
    }
  }

  // Other suites create orders for the same SKUs in parallel with stock assertions; a
  // minimum buffer keeps the arithmetic, not the fixture, the thing under test.
  return undefined;
};
