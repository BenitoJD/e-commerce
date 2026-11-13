// Crawl every URL the sitemap advertises and verify it actually works.
//
// The sitemap is what search engines trust: a URL listed there that 404s (or renders
// "₹NaN") is a broken promise, and the hand-maintained smoke list can never cover all
// products/brands. Concurrency is bounded so a crawl stays gentle on the box.
//
//   node scripts/crawl-sitemap.mjs [baseUrl] [--limit N] [--concurrency C]
const BASE = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};
const LIMIT = argOf('--limit', 500);
const CONCURRENCY = Math.max(1, argOf('--concurrency', 8));

const ARTEFACTS = [/\bundefined\b/, /\bNaN\b/, /Invalid Date/, /\[object Object\]/];

function visibleText(body) {
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
}

async function check(url) {
  const problems = [];
  let status = 0;
  let body = '';
  try {
    const res = await fetch(url, { redirect: 'manual' });
    status = res.status;
    body = await res.text();
  } catch (err) {
    return { url, status: 0, problems: [err.message] };
  }

  if (status !== 200) {
    problems.push(`status ${status}`);
    return { url, status, problems };
  }

  const text = visibleText(body);
  for (const re of ARTEFACTS) {
    const m = text.match(re);
    if (m) problems.push(`rendered artefact: ${m[0]}`);
  }

  const bodyOnly = text;
  const h1s = (bodyOnly.match(/<h1[\s>]/gi) || []).length;
  if (h1s !== 1) problems.push(`expected exactly one <h1>, found ${h1s}`);

  const head = body.slice(0, body.indexOf('</head>') + 7);
  const robots = (head.match(/<meta[^>]+name="robots"[^>]+content="([^"]*)"/i) || [])[1] || '';
  if (/noindex/i.test(robots)) {
    // A sitemap is a list of pages we WANT indexed; advertising a noindex page is a
    // contradiction that wastes crawl budget.
    problems.push('listed in the sitemap but marked noindex');
  }

  const canonical = (head.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i) || [])[1];
  if (!canonical && !/noindex/i.test(robots)) {
    problems.push('missing canonical link');
  } else if (canonical) {
    try {
      const got = decodeEntities(new URL(canonical).pathname).replace(/\/+$/, '') || '/';
      const want = new URL(url).pathname.replace(/\/+$/, '') || '/';
      if (got !== want) problems.push(`canonical ${got} does not match ${want}`);
    } catch {
      problems.push(`canonical is not a URL: ${canonical}`);
    }
  }

  return { url, status, problems };
}

async function main() {
  let xml;
  try {
    const res = await fetch(`${BASE}/sitemap.xml`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    xml = await res.text();
  } catch (err) {
    console.error(`[crawl] cannot read ${BASE}/sitemap.xml: ${err.message}`);
    process.exit(1);
  }

  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1].trim()));
  if (!locs.length) {
    console.error('[crawl] sitemap lists no URLs');
    process.exit(1);
  }

  // Sitemap entries carry the PUBLIC origin (NEXT_PUBLIC_SITE_URL), which is not reachable
  // while auditing a local/staging server. Audit by path against the base under test, and
  // say so once — the paths are what matters here.
  const publicOrigin = (() => {
    try { return new URL(locs[0]).origin; } catch { return null; }
  })();
  if (publicOrigin && publicOrigin !== BASE) {
    console.log(`[crawl] sitemap origin ${publicOrigin} differs from audit base ${BASE} — auditing by path`);
  }

  const targets = locs.slice(0, LIMIT).map((loc) => {
    try {
      const u = new URL(loc);
      return `${BASE}${u.pathname}${u.search}`;
    } catch {
      return loc;
    }
  });
  console.log(`[crawl] ${targets.length} URLs from the sitemap (concurrency ${CONCURRENCY})`);

  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const url = targets[cursor];
      cursor += 1;
      results.push(await check(url));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const failures = results.filter((r) => r.problems.length);
  for (const f of failures) {
    console.log(`FAIL ${f.status} ${f.url}`);
    for (const p of f.problems) console.log(`     - ${p}`);
  }
  console.log(`\n${results.length - failures.length}/${results.length} sitemap URLs ok (base: ${BASE})`);
  process.exit(failures.length ? 1 : 0);
}

main();
