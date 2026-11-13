const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CATEGORIES,
  resolveCategory,
  categorySlugs,
  allCategoryPaths,
  labelForPath,
} = require('../../../data/categories');

test('the taxonomy is two levels deep with unique slugs', () => {
  const parentSlugs = CATEGORIES.map((c) => c.slug);
  assert.equal(new Set(parentSlugs).size, parentSlugs.length, 'parent slugs must be unique');
  const childSlugs = CATEGORIES.flatMap((c) => c.children.map((k) => `${c.slug}/${k.slug}`));
  assert.equal(new Set(childSlugs).size, childSlugs.length, 'child paths must be unique');
  for (const c of CATEGORIES) {
    assert.ok(c.label, `${c.slug} needs a label`);
    assert.ok(c.children.length > 0, `${c.slug} should have at least one child`);
    for (const k of c.children) assert.ok(k.label, `${c.slug}/${k.slug} needs a label`);
  }
});

test('resolveCategory understands a parent, a path and a bare child', () => {
  assert.equal(resolveCategory('pumps').path, 'pumps');
  assert.equal(resolveCategory('pumps/submersible').path, 'pumps/submersible');
  assert.equal(resolveCategory('submersible').path, 'pumps/submersible', 'bare child still resolves');
  assert.equal(resolveCategory('PUMPS/Submersible').path, 'pumps/submersible', 'case insensitive');
  assert.equal(resolveCategory('pumps/nonexistent'), null);
  assert.equal(resolveCategory('nope'), null);
  assert.equal(resolveCategory(''), null);
  assert.equal(resolveCategory(null), null);
});

test('a parent view covers every child slug, a child view only itself', () => {
  assert.deepEqual(categorySlugs('pumps').sort(), ['monoblock', 'submersible']);
  assert.deepEqual(categorySlugs('pumps/submersible'), ['submersible']);
  assert.deepEqual(categorySlugs('unknown'), []);
});

test('every reusable path is listed once, parents before children', () => {
  const paths = allCategoryPaths();
  assert.ok(paths.includes('pumps'));
  assert.ok(paths.includes('pumps/submersible'));
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(
    paths.indexOf('pumps') < paths.indexOf('pumps/submersible'),
    'parents should precede their children'
  );
});

test('labels distinguish parent and child paths', () => {
  assert.equal(labelForPath('pumps'), 'Pumps');
  assert.equal(labelForPath('pumps/submersible'), 'Pumps › Submersible Pumps');
  assert.equal(labelForPath('bogus'), '');
});
