// Shared page checks for the audit scripts (audit-pages.mjs, crawl-sitemap.mjs).
//
// Kept in one module so the sampled audit and the full sitemap crawl cannot drift apart:
// both must agree on what a valid Product node, breadcrumb trail, canonical and artefact-free
// page means.
export const ARTEFACTS = [/\bundefined\b/, /\bNaN\b/, /Invalid Date/, /\[object Object\]/];

export function visibleText(body) {
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

export function findArtefacts(body) {
  const text = visibleText(body);
  const found = [];
  for (const re of ARTEFACTS) {
    const m = text.match(re);
    if (m) found.push(m[0]);
  }
  return found;
}

export function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function jsonLdBlocks(body) {
  const blocks = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(body))) blocks.push(decodeEntities(m[1]).trim());
  return blocks;
}

export function countH1(body) {
  const visible = visibleText(body);
  return (visible.match(/<h1[\s>]/gi) || []).length;
}

export function canonicalOf(body) {
  const head = body.slice(0, body.indexOf('</head>') + 7);
  const m = head.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i)
    || head.match(/<link[^>]+href="([^"]+)"[^>]+rel="canonical"/i);
  return m ? decodeEntities(m[1]) : '';
}

export function robotsOf(body) {
  const head = body.slice(0, body.indexOf('</head>') + 7);
  return (head.match(/<meta[^>]+name="robots"[^>]+content="([^"]*)"/i) || [])[1] || '';
}

// Returns a list of problems for one JSON-LD node (empty when valid).
export function productNodeProblems(node, where) {
  const problems = [];
  if (!node.name) problems.push(`${where}: Product has no name`);
  const offers = node.offers;
  if (!offers) {
    problems.push(`${where}: Product has no offers`);
    return problems;
  }
  const list = Array.isArray(offers) ? offers : [offers];
  for (const o of list) {
    if (o.price == null || o.price === '') problems.push(`${where}: offer has no price`);
    if (!o.priceCurrency) problems.push(`${where}: offer has no priceCurrency`);
    if (!o.availability) problems.push(`${where}: offer has no availability`);
  }
  return problems;
}

export function breadcrumbNodeProblems(node, where) {
  const problems = [];
  const items = node.itemListElement;
  if (!Array.isArray(items) || items.length < 2) {
    problems.push(`${where}: BreadcrumbList needs at least two items`);
    return problems;
  }
  items.forEach((it, i) => {
    if (!it.name) problems.push(`${where}: breadcrumb[${i}] has no name`);
    if (!it.item) problems.push(`${where}: breadcrumb[${i}] has no item URL`);
    if (Number(it.position) !== i + 1) problems.push(`${where}: breadcrumb[${i}] position should be ${i + 1}`);
  });
  return problems;
}

// Validates every JSON-LD block in a page; `needsJsonLd` controls whether having none is an
// error (catalogue pages) or acceptable (plain content pages).
export function jsonLdProblems(body, { needsJsonLd = true } = {}) {
  const problems = [];
  const blocks = jsonLdBlocks(body);
  if (blocks.length === 0) {
    if (needsJsonLd) problems.push('no JSON-LD found');
    return problems;
  }
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
      if (types.includes('Product')) problems.push(...productNodeProblems(node, `block ${i}`));
      if (types.includes('BreadcrumbList')) problems.push(...breadcrumbNodeProblems(node, `block ${i}`));
      if (types.includes('Organization') || types.includes('LocalBusiness') || types.includes('Store')) {
        if (!node.name) problems.push(`block ${i}: business has no name`);
      }
    }
  }
  return problems;
}
