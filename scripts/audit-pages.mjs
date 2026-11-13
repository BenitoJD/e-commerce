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

const ROUTES = [
  '/',
  `/category/${CATEGORY}`,
  PRODUCT ? `/product/${PRODUCT}` : null,
  '/deals',
  '/brands',
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

  const found = artefacts(body);
  if (found.length) problems.push(`rendered artefact(s): ${found.join(', ')}`);

  const blocks = jsonLdBlocks(body);
  if (blocks.length === 0) problems.push('no JSON-LD found');

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

  return { route, status, problems };
}

const results = [];
for (const route of ROUTES) results.push(await audit(route));

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
