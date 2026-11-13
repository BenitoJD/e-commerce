// Page audit for a running storefront: rendered-text artefacts + JSON-LD validity.
//
// The smoke suite checks that pages render and that no "₹NaN"/"undefined" leaks into the
// visible text. This script goes one level deeper on the SEO surface, which no unit test
// can see once the page is assembled: every <script type="application/ld+json"> block must
// parse, and Product/BreadcrumbList nodes must carry the fields search engines need.
//
// Usage: node scripts/audit-pages.mjs [baseUrl] [productSlug] [category] [brand]
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

const ARTEFACTS = [/\bundefined\b/, /\bNaN\b/, /Invalid Date/, /\[object Object\]/];

function visibleText(body) {
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function artefacts(body) {
  const text = visibleText(body);
  const found = [];
  for (const re of ARTEFACTS) {
    const m = text.match(re);
    if (m) found.push(m[0]);
  }
  return found;
}

// Next serialises JSON-LD inside a script tag; entities like &quot; can appear.
function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function jsonLdBlocks(body) {
  const blocks = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(body))) blocks.push(decodeEntities(m[1]).trim());
  return blocks;
}

function assertProduct(node, problems, where) {
  if (!node.name) problems.push(`${where}: Product has no name`);
  const offers = node.offers;
  if (!offers) {
    problems.push(`${where}: Product has no offers`);
    return;
  }
  const list = Array.isArray(offers) ? offers : [offers];
  for (const o of list) {
    if (o.price == null || o.price === '') problems.push(`${where}: offer has no price`);
    if (!o.priceCurrency) problems.push(`${where}: offer has no priceCurrency`);
    if (!o.availability) problems.push(`${where}: offer has no availability`);
  }
}

function assertBreadcrumb(node, problems, where) {
  const items = node.itemListElement;
  if (!Array.isArray(items) || items.length < 2) {
    problems.push(`${where}: BreadcrumbList needs at least two items`);
    return;
  }
  items.forEach((it, i) => {
    if (!it.name) problems.push(`${where}: breadcrumb[${i}] has no name`);
    if (!it.item) problems.push(`${where}: breadcrumb[${i}] has no item URL`);
    if (Number(it.position) !== i + 1) problems.push(`${where}: breadcrumb[${i}] position should be ${i + 1}`);
  });
}

function metaAudit(route, body, problems) {
  const head = body.slice(0, body.indexOf('</head>') + 7);
  const title = (head.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  if (!title || !title.trim()) problems.push('missing <title>');
  // Exactly one H1 in the rendered body: the page's subject, not a second competing one.
  const bodyOnly = body.slice(body.indexOf('<body') > -1 ? body.indexOf('<body') : 0).replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const h1s = (bodyOnly.match(/<h1[\s>]/gi) || []).length;
  if (h1s !== 1) problems.push(`expected exactly one <h1>, found ${h1s}`);

  // Every <img> needs an alt attribute. An empty alt="" is fine (decorative) — a missing
  // attribute is what screen readers announce as the raw URL.
  const imgs = bodyOnly.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter((tag) => !/\balt\s*=/.test(tag));
  if (noAlt.length) problems.push(`${noAlt.length} <img> without alt text`);

  // Canonical: present, absolute, path matches the route (a copy-pasted canonical points
  // every product at the same URL and de-indexes the rest).
  const canonical = (head.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)
    || head.match(/<link[^>]+href="([^"]+)"[^>]+rel="canonical"/i)
    || [])[1];
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
  const robots = (head.match(/<meta[^>]+name="robots"[^>]+content="([^"]*)"/i) || [])[1] || '';
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

  const found = artefacts(body);
  if (found.length) problems.push(`rendered artefact(s): ${found.join(', ')}`);

  const blocks = jsonLdBlocks(body);
  // Catalogue pages must expose structured data; plain content pages (policies, about)
  // legitimately have none.
  const needsJsonLd = route === '/' || route.startsWith('/product/') || route.startsWith('/category/');
  if (blocks.length === 0 && needsJsonLd) problems.push('no JSON-LD found');

  for (const [i, block] of blocks.entries()) {
    let parsed;
    try {
      parsed = JSON.parse(block);
    } catch (err) {
      problems.push(`JSON-LD block ${i} does not parse: ${err.message.slice(0, 80)}`);
      continue;
    }
    const nodes = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const type = node['@type'];
      const types = Array.isArray(type) ? type : [type];
      if (types.includes('Product')) assertProduct(node, problems, `block ${i}`);
      if (types.includes('BreadcrumbList')) assertBreadcrumb(node, problems, `block ${i}`);
      if (types.includes('Organization') || types.includes('LocalBusiness') || types.includes('Store')) {
        if (!node.name) problems.push(`block ${i}: business has no name`);
      }
    }
  }

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
