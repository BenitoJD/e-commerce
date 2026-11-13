const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCategoryTree } = require('../categoryTree');
const { CATEGORIES } = require('../../../data/categories');

test('buildCategoryTree merges child counts into parents', () => {
  const { tree, unknown } = buildCategoryTree([
    { category: 'pumps', subcategory: 'submersible', count: 1 },
    { category: 'pumps', subcategory: 'monoblock', count: 2 },
    { category: 'power-tools', subcategory: 'drills', count: 4 },
  ], CATEGORIES);

  assert.deepEqual(unknown, []);
  const pumps = tree.find((c) => c.slug === 'pumps');
  assert.equal(pumps.count, 3, 'parent count is the sum of its children');
  assert.equal(pumps.children.find((k) => k.slug === 'submersible').count, 1);
  assert.equal(pumps.children.find((k) => k.slug === 'monoblock').count, 2);
  assert.equal(pumps.children.find((k) => k.slug === 'openwell'), undefined, 'removed branches stay gone');

  const tools = tree.find((c) => c.slug === 'power-tools');
  assert.equal(tools.count, 4);
  assert.ok(tools.children.every((k) => typeof k.count === 'number'), 'every child reports a count');
});

test('buildCategoryTree keeps empty categories visible with zero counts', () => {
  const { tree } = buildCategoryTree([], CATEGORIES);
  assert.equal(tree.length, CATEGORIES.length);
  for (const parent of tree) {
    assert.equal(parent.count, 0);
    for (const child of parent.children) assert.equal(child.count, 0);
  }
});

test('buildCategoryTree surfaces catalogue rows outside the taxonomy', () => {
  const { tree, unknown } = buildCategoryTree([
    { category: 'garden', subcategory: 'shovels', count: 3 },
  ], CATEGORIES);
  assert.deepEqual(unknown, ['garden'], 'unknown categories must be reported, not silently dropped');
  assert.ok(tree.every((c) => c.count === 0), 'they do not leak into the tree');
});

test('buildCategoryTree tolerates junk rows', () => {
  const { tree, unknown } = buildCategoryTree([
    null,
    {},
    { category: '', count: 5 },
    { category: 'pumps', subcategory: null, count: 'nope' },
  ], CATEGORIES);
  assert.deepEqual(unknown, []);
  const pumps = tree.find((c) => c.slug === 'pumps');
  assert.equal(pumps.count, 0, 'a non-numeric count is treated as zero');
});

test('every tree path is parent/child shaped', () => {
  const { tree } = buildCategoryTree([], CATEGORIES);
  for (const parent of tree) {
    assert.equal(parent.path, parent.slug);
    for (const child of parent.children) assert.equal(child.path, `${parent.slug}/${child.slug}`);
  }
});
