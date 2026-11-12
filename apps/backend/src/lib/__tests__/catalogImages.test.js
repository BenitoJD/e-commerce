const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const products = require('../../../data/products');

// The storefront serves /images/* from apps/storefront/public/images, so a catalog
// image path that doesn't exist there renders as a broken image on every card.
// This guards that class of bug (it was real: all 30 paths used to 404).
const STOREFRONT_PUBLIC = path.join(__dirname, '..', '..', '..', '..', 'storefront', 'public');

test('every catalog image resolves to a file the storefront can serve', () => {
  const missing = [];
  for (const p of products) {
    for (const src of p.images || []) {
      if (!src.startsWith('/')) continue; // external URL: nothing to check locally
      const onDisk = path.join(STOREFRONT_PUBLIC, src.replace(/^\//, ''));
      if (!fs.existsSync(onDisk)) missing.push(`${p.slug} -> ${src}`);
    }
  }
  assert.deepEqual(missing, [], `missing image files:\n${missing.join('\n')}`);
});

test('storefront public/images exists (Docker COPY depends on it)', () => {
  assert.equal(fs.existsSync(path.join(STOREFRONT_PUBLIC, 'images')), true);
});
