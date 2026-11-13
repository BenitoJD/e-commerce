// Poll every URL the sitemap advertises and verify it actually works, including the
// structured data on each page (30+ product pages, not just the one the sampled audit sees).
//
//   node scripts/crawl-sitemap.mjs [baseUrl] [--limit N] [--concurrency C]
import {
  findArtefacts, countH1, canonicalOf, robotsOf, jsonLdProblems,
} from './lib/pageChecks.mjs';

const BASE = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};
const LIMIT = argOf('--limit', 500);
const CONCURRENCY = Math.max(1, argOf('--concurrency', 8));

// Catalogue pages must carry structured data; plain content pages need not.
function needsJsonLd(pathname) {
  return pathname === '/' || pathname.startsWith('/product/') || pathname.startsWith('/category/');
}

async function check(url, pathname) {
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

  for (const a of findArtefacts(body)) problems.push(`rendered artefact: ${a}`);

  const h1s = countH1(body);
  if (h1s !== 1) problems.push(`expected exactly one <h1>, found ${h1s}`);

  const robots = robotsOf(body);
  // A sitemap is a list of pages we WANT indexed; advertising a noindex page wastes crawl
  // budget and contradicts the page's own instruction.
  if (/noindex/i.test(robots)) problems.push('listed in the sitemap but marked noindex');

  const canonical = canonicalOf(body);
  if (!canonical) {
    if (!/noindex/i.test(robots)) problems.push('missing canonical link');
  } else {
    try {
      const got = new URL(canonical).pathname.replace(/\/+$/, '') || '/';
      const want = pathname.replace(/\/+$/, '') || '/';
      if (got !== want) problems.push(`canonical ${got} does not match ${want}`);
    } catch {
      problems.push(`canonical is not a URL: ${canonical}`);
    }
  }

  problems.push(...jsonLdProblems(body, { needsJsonLd: needsJsonLd(pathname) }));

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

  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (!locs.length) {
    console.error('[crawl] sitemap lists no URLs');
    process.exit(1);
  }

  // Sitemap entries carry the PUBLIC origin (NEXT_PUBLIC_SITE_URL), which is not reachable
  // while auditing a local/staging server. Audit by path against the base under test.
  const publicOrigin = (() => {
    try { return new URL(locs[0]).origin; } catch { return null; }
  })();
  if (publicOrigin && publicOrigin !== BASE) {
    console.log(`[crawl] sitemap origin ${publicOrigin} differs from audit base ${BASE} — auditing by path`);
  }

  const targets = locs.slice(0, LIMIT).map((loc) => {
    try {
      const u = new URL(loc);
      const pathname = u.pathname;
      return { url: `${BASE}${pathname}${u.search}`, pathname };
    } catch {
      return { url: loc, pathname: '/' };
    }
  });

  console.log(`[crawl] ${targets.length} URLs from the sitemap (concurrency ${CONCURRENCY})`);

  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const { url, pathname } = targets[cursor];
      cursor += 1;
      results.push(await check(url, pathname));
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
