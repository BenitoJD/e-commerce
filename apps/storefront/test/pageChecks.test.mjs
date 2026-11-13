import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findArtefacts, countH1, canonicalOf, robotsOf, jsonLdProblems, decodeEntities,
} from '../../../scripts/lib/pageChecks.mjs';

const page = ({ head = '', body = '' }) => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

test('artefacts are found in visible text but not inside scripts', () => {
  const bad = page({ body: '<h1>Hi</h1><p>Price ₹NaN</p>' });
  assert.deepEqual(findArtefacts(bad), ['NaN']);
  const scriptOnly = page({ body: '<h1>Hi</h1><script>var undefined=1</script>' });
  assert.deepEqual(findArtefacts(scriptOnly), [], 'runtime strings in scripts are not rendered artefacts');
});

test('countH1 ignores <h1> inside scripts and counts real headings', () => {
  assert.equal(countH1(page({ body: '<h1>A</h1><h1>B</h1>' })), 2);
  assert.equal(countH1(page({ body: '<h1>A</h1><script>"<h1>x</h1>"</script>' })), 1);
});

test('canonical and robots are read from the head, entity-decoded', () => {
  const html = page({ head: '<link rel="canonical" href="https://shop.test/product/a?x=1&amp;y=2"><meta name="robots" content="noindex, follow">' });
  assert.equal(canonicalOf(html), 'https://shop.test/product/a?x=1&y=2');
  assert.equal(robotsOf(html), 'noindex, follow');
  assert.equal(decodeEntities('a &amp; b &quot;c&quot; &#x27;d&#x27;'), 'a & b "c" \'d\'');
});

test('a valid Product node passes; missing offers/currency/availability fail', () => {
  const good = page({
    body: `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product', name: 'Drill',
      offers: { price: '3499', priceCurrency: 'INR', availability: 'https://schema.org/InStock' },
    })}</script>`,
  });
  assert.deepEqual(jsonLdProblems(good), []);

  const bad = page({
    body: `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product', name: 'Drill', offers: { price: '3499' },
    })}</script>`,
  });
  const problems = jsonLdProblems(bad);
  assert.ok(problems.some((p) => /priceCurrency/.test(p)));
  assert.ok(problems.some((p) => /availability/.test(p)));
});

test('breadcrumb positions must be sequential and each item needs a name and URL', () => {
  const bad = page({
    body: `<script type="application/ld+json">${JSON.stringify({
      '@type': 'BreadcrumbList',
      itemListElement: [{ position: 2, name: 'Only' }],
    })}</script>`,
  });
  const problems = jsonLdProblems(bad);
  assert.ok(problems.some((p) => /at least two items/.test(p)));

  const skewed = page({
    body: `<script type="application/ld+json">${JSON.stringify({
      '@type': 'BreadcrumbList',
      itemListElement: [{ position: 2, name: 'A', item: 'https://x/a' }, { position: 1, name: 'B', item: 'https://x/b' }],
    })}</script>`,
  });
  assert.ok(jsonLdProblems(skewed).some((p) => /position should be 1/.test(p)));
});

test('unparseable JSON-LD is reported, and missing blocks only matter when required', () => {
  const broken = page({ body: '<script type="application/ld+json">{not json</script>' });
  assert.ok(jsonLdProblems(broken).some((p) => /does not parse/.test(p)));

  const content = page({ body: '<h1>About</h1>' });
  assert.deepEqual(jsonLdProblems(content, { needsJsonLd: false }), []);
  assert.deepEqual(jsonLdProblems(content, { needsJsonLd: true }), ['no JSON-LD found']);
});
