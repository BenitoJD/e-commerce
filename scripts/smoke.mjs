#!/usr/bin/env node
// Route smoke test for a running storefront (+ optional API).
//
//   BASE_URL=http://localhost:3000 node scripts/smoke.mjs
//
// Exits non-zero if any route is not 200, so it can gate a deploy.
// Override sample slugs for your own catalogue:
//   PRODUCT_SLUG=bosch-gsb-13-re-drill BRAND= Bosch CATEGORY=power-tools

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const PRODUCT = process.env.PRODUCT_SLUG || 'product-1';
const BRAND = process.env.BRAND || 'Brand1';
const CATEGORY = process.env.CATEGORY || 'power-tools';

const ROUTES = [
  '/',
  `/category/all`,
  `/category/${CATEGORY}`,
  `/product/${PRODUCT}`,
  '/brands',
  `/brand/${BRAND}`,
  '/deals',
  '/cart',
  '/checkout',
  '/wishlist',
  '/my-orders',
  '/track-order',
  '/order-success?receipt=smoke',
  '/invoice/smoke',
  '/returns',
  '/bulk-quote',
  '/bulk-orders',
  '/emi-options',
  '/about-us',
  '/contact-us',
  '/shipping-policy',
  '/returns-policy',
  '/warranty-policy',
  '/privacy-policy',
  '/terms-conditions',
  '/admin',
  '/robots.txt',
  '/sitemap.xml',
];

// Content markers that prove the page actually rendered (not just a shell).
const MARKERS = {
  '/': ['Bestsellers'],
  '/deals': ['Deals of the Day'],
  '/brands': ['Shop by Brand'],
  '/cart': ['Your Cart'],
  '/checkout': ['Checkout'],
  '/wishlist': ['Wishlist'],
  '/track-order': ['Track Your Order'],
  '/returns': ['Return or Exchange'],
  '/admin': ['Admin Console'],
  '/robots.txt': ['User-agent:'],
};

async function check(route) {
  const url = BASE + route;
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const body = await res.text();
    const problems = [];
    if (res.status !== 200) problems.push(`status ${res.status}`);
    for (const marker of MARKERS[route] || []) {
      if (!body.toLowerCase().includes(marker.toLowerCase())) problems.push(`missing "${marker}"`);
    }
    if (route === '/sitemap.xml' && res.status === 200 && !body.includes('<urlset')) {
      problems.push('sitemap is not XML (is the backend reachable?)');
    }
    return { route, status: res.status, bytes: body.length, problems };
  } catch (err) {
    return { route, status: 0, bytes: 0, problems: [err.message] };
  }
}

const results = [];
for (const route of ROUTES) {
  // Sequential on purpose: keeps output readable and avoids hammering a small VPS.
  results.push(await check(route));
}

let failed = 0;
for (const r of results) {
  const ok = r.problems.length === 0;
  if (!ok) failed += 1;
  const label = ok ? 'ok  ' : 'FAIL';
  const detail = ok ? '' : `  <- ${r.problems.join('; ')}`;
  console.log(`${label} ${String(r.status).padEnd(3)} ${String(r.bytes).padStart(7)}B  ${r.route}${detail}`);
}

console.log(`\n${results.length - failed}/${results.length} routes ok (base: ${BASE})`);
process.exit(failed ? 1 : 0);
