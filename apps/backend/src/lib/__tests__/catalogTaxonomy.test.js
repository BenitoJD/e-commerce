const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { CATEGORIES } = require('../../../data/categories');

// Guards the catalogue data: every product must sit in a real subcategory that belongs to
// its own parent category. A wrong mapping (a chainsaw filed under "Drills") is worse than
// no subcategory at all, because the child page then shows the wrong products.
const products = (() => {
  const mod = require('../../../data/products');
  return Array.isArray(mod) ? mod : mod.products;
})();

const parentOfChild = new Map();
for (const c of CATEGORIES) for (const k of c.children) parentOfChild.set(k.slug, c.slug);

test('every product has a subcategory that exists in the taxonomy', () => {
  const bad = [];
  for (const p of products) {
    if (!p.subcategory) { bad.push(`${p.slug}: missing subcategory`); continue; }
    if (!parentOfChild.has(p.subcategory)) bad.push(`${p.slug}: unknown subcategory '${p.subcategory}'`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('every product subcategory belongs to its own parent category', () => {
  const mismatched = products
    .filter((p) => parentOfChild.get(p.subcategory) !== p.category)
    .map((p) => `${p.slug}: ${p.category} vs ${parentOfChild.get(p.subcategory)}/${p.subcategory}`);
  assert.deepEqual(mismatched, [], mismatched.join('\n'));
});

test('every declared subcategory has at least one product', () => {
  const used = new Set(products.map((p) => p.subcategory));
  const empty = CATEGORIES.flatMap((c) => c.children.filter((k) => !used.has(k.slug)).map((k) => `${c.slug}/${k.slug}`));
  assert.deepEqual(empty, [], `subcategories with no products: ${empty.join(', ')}`);
});
