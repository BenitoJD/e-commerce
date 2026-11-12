const { describe, it } = require('node:test');
const assert = require('node:assert');
const products = require('../../../data/products');

describe('products catalog', () => {
  it('has 30 items', () => {
    assert.strictEqual(products.length, 30);
  });

  it('has unique slugs', () => {
    const slugs = products.map((p) => p.slug);
    assert.strictEqual(new Set(slugs).size, slugs.length);
  });

  it('has required fields with valid values', () => {
    for (const p of products) {
      assert.ok(p.slug && typeof p.slug === 'string', `slug missing: ${JSON.stringify(p)}`);
      assert.ok(p.name && typeof p.name === 'string', `name missing: ${p.slug}`);
      assert.ok(p.brand && typeof p.brand === 'string', `brand missing: ${p.slug}`);
      assert.ok(p.category && typeof p.category === 'string', `category missing: ${p.slug}`);
      assert.ok(Number.isInteger(p.price_paise) && p.price_paise > 0, `price invalid: ${p.slug}`);
      assert.ok(Number.isInteger(p.mrp_paise) && p.mrp_paise >= p.price_paise, `mrp invalid: ${p.slug}`);
      assert.ok(p.hsn && typeof p.hsn === 'string', `hsn missing: ${p.slug}`);
      assert.ok(Number.isInteger(p.stock) && p.stock >= 0, `stock invalid: ${p.slug}`);
      assert.ok(p.specs && typeof p.specs === 'object', `specs missing: ${p.slug}`);
      assert.ok(Array.isArray(p.images) && p.images.length > 0, `images missing: ${p.slug}`);
      if (p.videos !== undefined) {
        assert.ok(Array.isArray(p.videos), `videos must be an array: ${p.slug}`);
        for (const v of p.videos) {
          assert.match(v, /^https:\/\/(www\.)?(youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/|vimeo\.com\/)/, `bad video url: ${p.slug}`);
        }
      }
    }
  });

  it('uses integer paise values', () => {
    for (const p of products) {
      assert.ok(Number.isInteger(p.price_paise), `price not integer: ${p.slug}`);
      assert.ok(Number.isInteger(p.mrp_paise), `mrp not integer: ${p.slug}`);
    }
  });
});
