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
  '/category/pumps/submersible',
  `/product/${PRODUCT}`,
  '/brands',
  `/brand/${BRAND}`,
  '/deals',
  '/cart',
  '/checkout',
  '/wishlist',
  '/compare',
  '/my-orders',
  '/track-order',
  '/order-success?receipt=smoke',
  // Invoices are per-order: a fake receipt is a 404 (see EXPECTED_STATUS). With a real one,
  // pass INVOICE_RECEIPT to include it in the 200 sweep.
  ...(process.env.INVOICE_RECEIPT ? [`/invoice/${process.env.INVOICE_RECEIPT}`] : []),
  '/returns',
  '/bulk-quote',
  '/bulk-orders',
  '/emi-options',
  '/faq',
  '/login',
  '/register',
  '/account',
  '/account/forgot',
  '/account/reset',
  '/about-us',
  '/contact-us',
  '/shipping-policy',
  '/returns-policy',
  '/cancellation-policy',
  '/warranty-policy',
  '/privacy-policy',
  '/terms-conditions',
  '/admin',
  '/admin/picking?ids=smoke',
  '/robots.txt',
  '/sitemap.xml',
];

// Routes that must NOT return 200, with the marker proving the right page rendered.
const EXPECTED_STATUS = {
  '/definitely-not-a-page': { status: 404, marker: "couldn't find that page" },
  // Unknown catalogue slugs must be real 404s, not empty 200s that search engines index.
  '/category/does-not-exist': { status: 404, marker: "couldn't find that page" },
  '/category/pumps/does-not-exist': { status: 404, marker: "couldn't find that page" },
  '/product/does-not-exist': { status: 404, marker: "couldn't find that page" },
  // An invoice for an unknown receipt must 404, not print an empty "Tax Invoice".
  '/invoice/does-not-exist': { status: 404, marker: "couldn't find that page" },
};

// Content markers that prove the page actually rendered (not just a shell).
const MARKERS = {
  '/': ['Bestsellers'],
  '/deals': ['Deals of the Day'],
  '/brands': ['Shop by Brand'],
  '/cart': ['Your Cart'],
  '/checkout': ['Checkout'],
  '/wishlist': ['Wishlist'],
  '/compare': ['Compare products'],
  '/track-order': ['Track Your Order'],
  '/returns': ['Return or Exchange'],
  '/admin': ['Admin Console'],
  '/category/pumps/submersible': ['Submersible Pumps'],
  '/robots.txt': ['User-agent:'],
};

// Template artefacts that mean a value failed to render (a mock-hidden bug in the making).
// Script/style blocks are stripped first: Next's own runtime legitimately contains these
// words, and flagging them would make the check useless noise.
const ARTEFACTS = [/\bundefined\b/, /\bNaN\b/, /Invalid Date/, /\[object Object\]/];

function visibleText(body) {
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function findArtefacts(body) {
  const text = visibleText(body);
  const found = [];
  for (const re of ARTEFACTS) {
    const m = text.match(re);
    if (m) found.push(m[0]);
  }
  return found;
}

async function check(route) {
  const url = BASE + route;
  const expected = EXPECTED_STATUS[route];
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const body = await res.text();
    const problems = [];

    if (expected) {
      if (res.status !== expected.status) problems.push(`expected ${expected.status}, got ${res.status}`);
      if (expected.marker && !body.toLowerCase().includes(expected.marker.toLowerCase())) {
        problems.push(`missing "${expected.marker}"`);
      }
    } else {
      if (res.status !== 200) problems.push(`status ${res.status}`);
      for (const marker of MARKERS[route] || []) {
        if (!body.toLowerCase().includes(marker.toLowerCase())) problems.push(`missing "${marker}"`);
      }
      if (route === '/sitemap.xml' && res.status === 200 && !body.includes('<urlset')) {
        problems.push('sitemap is not XML (is the backend reachable?)');
      }
    }

    // HTML pages only: XML/TXT bodies aren't rendered templates.
    const isHtml = res.status === 200 && !/\.(xml|txt)$/.test(route);
    if (isHtml) {
      const artefacts = findArtefacts(body);
      if (artefacts.length) problems.push(`rendered artefact(s): ${artefacts.join(', ')}`);
    }

    return { route, status: res.status, bytes: body.length, problems };
  } catch (err) {
    return { route, status: 0, bytes: 0, problems: [err.message] };
  }
}

const results = [];
for (const route of [...ROUTES, ...Object.keys(EXPECTED_STATUS)]) {
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
