// Page audit for a running storefront: rendered-text artefacts + JSON-LD validity.
//
// The smoke suite checks that pages render and that no "₹NaN"/"undefined" leaks into the
// visible text. This script goes one level deeper on the SEO surface, which no unit test
// can see once the page is assembled: every <script type="application/ld+json"> block must
// parse, and Product/BreadcrumbList nodes must carry the fields search engines need.
//
// Usage: node scripts/audit-pages.mjs [baseUrl] [productSlug] [category] [brand]
import {
  findArtefacts, decodeEntities, jsonLdProblems, countH1, canonicalOf, robotsOf,
} from './lib/pageChecks.mjs';

const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const PRODUCT = process.argv[3] || process.env.PRODUCT_SLUG || '';
const CATEGORY = process.argv[4] || process.env.CATEGORY || 'power-tools';
const BRAND = process.argv[5] || process.env.BRAND || '';

const ROUTES = [
  '/',
  `/category/${CATEGORY}`,
  `/category/${CATEGORY}/drills`,
  PRODUCT ? `/product/${PRODUCT}` : null,
  '/deals',
  '/brands',
  BRAND ? `/brand/${BRAND}` : null,
  // Content pages are client-rendered with layout metadata — the place canonicals go missing.
  '/about-us',
  '/contact-us',
  '/shipping-policy',
  '/returns-policy',
  '/warranty-policy',
  '/privacy-policy',
  '/terms-conditions',
  '/cancellation-policy',
  '/emi-options',
  '/bulk-quote',
].filter(Boolean);

function metaAudit(route, body, problems) {
  const head = body.slice(0, body.indexOf('</head>') + 7);
  const title = (head.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  if (!title || !title.trim()) problems.push('missing <title>');

  // Exactly one H1 in the rendered body: the page's subject, not a second competing one.
  const h1s = countH1(body);
  if (h1s !== 1) problems.push(`expected exactly one <h1>, found ${h1s}`);

  // Every <img> needs an alt attribute. An empty alt="" is fine (decorative) — a missing
  // attribute is what screen readers announce as the raw URL.
  const bodyOnly = body.slice(body.indexOf('<body') > -1 ? body.indexOf('<body') : 0).replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const imgs = bodyOnly.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter((tag) => !/\balt\s*=/.test(tag));
  if (noAlt.length) problems.push(`${noAlt.length} <img> without alt text`);

  // Canonical: present, absolute, path matches the route (a copy-pasted canonical points
  // every product at the same URL and de-indexes the rest).
  const canonical = canonicalOf(body);
  if (!canonical) {
    problems.push('missing canonical link');
  } else {
    if (!/^https?:\/\//.test(canonical)) problems.push(`canonical is not absolute: ${canonical}`);
    if (/localhost|127\.0\.0\.1/.test(canonical)) problems.push(`canonical points at localhost: ${canonical}`);
    try {
      const u = new URL(canonical);
      const want = route.split('?')[0].replace(/\/+$/, '') || '/';
      const got = u.pathname.replace(/\/+$/, '') || '/';
      if (decodeURIComponent(got) !== decodeURIComponent(want)) {
        problems.push(`canonical path ${got} does not match route ${want}`);
      }
    } catch {
      problems.push(`canonical is not a URL: ${canonical}`);
    }
  }

  // Public pages must not tell crawlers to stay away.
  const robots = robotsOf(body);
  if (/noindex/i.test(robots)) problems.push(`public page is noindex: ${robots}`);

  return title ? title.trim() : '';
}

async function audit(route) {
  const problems = [];
  let body = '';
  let status = 0;
  try {
    const res = await fetch(BASE + route);
    status = res.status;
    body = await res.text();
  } catch (err) {
    return { route, status: 0, problems: [err.message] };
  }
  if (status !== 200) problems.push(`status ${status}`);

  const title = metaAudit(route, body, problems);

  for (const a of findArtefacts(body)) problems.push(`rendered artefact(s): ${a}`);

  // Catalogue pages must expose structured data; plain content pages legitimately have none.
  const needsJsonLd = route === '/' || route.startsWith('/product/') || route.startsWith('/category/');
  problems.push(...jsonLdProblems(body, { needsJsonLd }));

  return { route, status, title, problems };
}

const results = [];
for (const route of ROUTES) results.push(await audit(route));

// Duplicate titles across different pages are a classic SEO defect and invisible per-page.
// Reported once per title, listing every route that shares it.
const byTitle = new Map();
for (const r of results) {
  if (!r.title) continue;
  if (!byTitle.has(r.title)) byTitle.set(r.title, []);
  byTitle.get(r.title).push(r.route);
}
for (const [title, routes] of byTitle) {
  if (routes.length < 2) continue;
  for (const r of results) {
    if (routes.includes(r.route)) {
      r.problems.push(`title shared by ${routes.length} routes (${routes.join(', ')}): "${title}"`);
    }
  }
}

let failures = 0;
for (const r of results) {
  if (r.problems.length) {
    failures += 1;
    console.log(`FAIL ${r.status} ${r.route}`);
    for (const p of r.problems) console.log(`     - ${p}`);
  } else {
    console.log(`ok   ${r.status} ${r.route}`);
  }
}
console.log(`\n${results.length - failures}/${results.length} pages ok (base: ${BASE})`);
process.exit(failures ? 1 : 0);
