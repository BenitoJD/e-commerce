const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The README is the first thing a new operator follows. Numbers in it drift silently every
// time a page or a smoke check is added, so derive them from source and compare.
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const README = path.join(ROOT, 'README.md');
const SMOKE = path.join(ROOT, 'scripts', 'smoke.mjs');

function countPages() {
  let n = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); }
      else if (e.name === 'page.js') n += 1;
    }
  };
  walk(path.join(ROOT, 'apps', 'storefront', 'app'));
  return n;
}

function countSmokeChecks() {
  const src = fs.readFileSync(SMOKE, 'utf8');
  const start = src.indexOf('const ROUTES = [');
  const block = src.slice(start, src.indexOf('];', start));
  const routes = block.split('\n').filter((l) => /^\s*['`]/.test(l)).length;
  const expected = (src.match(/EXPECTED_STATUS = \{[\s\S]*?\};/) || [''])[0]
    .split('\n').filter((l) => /^\s*['`]/.test(l)).length;
  return routes + expected;
}

test('README route counts match the code', () => {
  const readme = fs.readFileSync(README, 'utf8');
  const pages = countPages();
  const smoke = countSmokeChecks();

  // "Next.js 14 App Router (N routes)"
  const appRouter = readme.match(/App Router \((\d+) routes?\)/);
  assert.ok(appRouter, 'README should state the route count');
  assert.equal(Number(appRouter[1]), pages, `README says ${appRouter[1]} routes, app/ has ${pages} pages`);

  // "must compile all N routes"
  for (const m of readme.matchAll(/all (\d+) routes/g)) {
    assert.equal(Number(m[1]), pages, `README build claim says ${m[1]}, actual ${pages}`);
  }

  // "N/N routes (… + a branded 404)"
  const smokeClaim = readme.match(/(\d+)\/(\d+) routes/);
  assert.ok(smokeClaim, 'README should state the smoke-suite size');
  assert.equal(Number(smokeClaim[1]), smoke, `README smoke claim says ${smokeClaim[1]}, script checks ${smoke}`);
  assert.equal(Number(smokeClaim[2]), smoke);
});
