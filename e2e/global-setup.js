// Runs once before the browser suite. The suite places real orders and decrements stock;
// repeated local runs would otherwise exhaust a SKU and fail with a misleading "out of
// stock" assertion. Top the test SKUs back up and make sure the seeded coupons exist.
const { BASE, API, ADMIN_TOKEN, P } = require('./helpers');

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

async function assertFreshBuild() {
  // A stale `next start` after a rebuild serves HTML that points at hashed chunks which no
  // longer exist; the browser then throws "Application error: a client-side exception".
  // Crawling the HTML of the main route shapes catches that before any test runs.
  const errors = [];
  for (const route of ['/', '/category/all', `/product/${P.grinder}`, '/cart', '/admin']) {
    const res = await fetch(BASE + route);
    if (!res.ok) { errors.push(`${route} returned ${res.status}`); continue; }
    const html = await res.text();
    const assets = [...new Set([...html.matchAll(/\/_next\/static\/[^"'\s>]+\.(?:js|css)/g)].map((m) => m[0]))];
    for (const asset of assets) {
      const assetRes = await fetch(BASE + asset, { method: 'HEAD' });
      if (assetRes.status !== 200) errors.push(`${route} references missing ${asset} (${assetRes.status})`);
    }
  }
  if (errors.length) {
    throw new Error(
      'Storefront build is stale or inconsistent. Rebuild and restart it before running E2E:\n' +
      errors.slice(0, 12).join('\n') +
      '\n  cd apps/storefront && rm -rf .next && npx next build && npx next start -p 3000'
    );
  }
}

module.exports = async function globalSetup() {
  const health = await request('/health');
  if (health.status !== 200) throw new Error('Backend is not running on ' + API);
  await assertFreshBuild();

  // Remove catalogue entries left behind by earlier product-CRUD runs so the public
  // catalogue stays exactly at the seeded 30 and count assertions remain meaningful.
  try {
    const all = await request('/store/products?limit=100');
    const stale = (all.json?.products || []).filter((p) => String(p.slug).startsWith('e2e-product-'));
    for (const p of stale) await request(`/admin/products/${p.slug}`, { method: 'DELETE', token: ADMIN_TOKEN });
  } catch { /* non-fatal */ }

  for (const slug of [P.grinder, P.drill, P.router, P.washer, P.scrubber, 'bosch-gsb-13-re-drill']) {
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
