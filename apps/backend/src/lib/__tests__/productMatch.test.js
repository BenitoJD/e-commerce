const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreProduct, tokens, resolveProductText } = require('../productMatch');

const PRODUCTS = [
  { slug: 'bosch-gsb-13-re-drill', name: 'Bosch GSB 13 RE 600W Impact Drill', brand: 'Bosch' },
  { slug: 'bosch-gws-600-grinder', name: 'Bosch GWS 600 670W 100mm Angle Grinder', brand: 'Bosch' },
  { slug: 'cri-2hp-submersible', name: 'CRI 2HP V9 Submersible Pump Set 150mm Borewell', brand: 'CRI' },
];

test('tokens drop noise and keep model numbers', () => {
  assert.deepEqual(tokens('Bosch GSB 13 RE Drill'), ['bosch', 'gsb', '13', 're', 'drill']);
});

test('scoring prefers the product with more matching model tokens', () => {
  const drill = scoreProduct('Bosch GSB 13 RE Drill', PRODUCTS[0]);
  const grinder = scoreProduct('Bosch GSB 13 RE Drill', PRODUCTS[1]);
  assert.ok(drill > grinder, `${drill} should beat ${grinder}`);
  assert.equal(scoreProduct('unrelated phrase here', PRODUCTS[0]), 0);
});

test('a single generic token is not enough, but a distinctive one is', () => {
  assert.equal(scoreProduct('drill', PRODUCTS[0]), 0);
  assert.ok(scoreProduct('submersible', PRODUCTS[2]) > 0);
});

test('resolveProductText falls back to token scoring when the name is approximate', async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/LOWER\(slug\) = LOWER\(\$1\)/.test(sql)) return { rows: [] };
      return { rows: PRODUCTS };
    },
  };
  const match = await resolveProductText(db, 'Bosch GSB 13 RE Drill');
  assert.equal(match.slug, 'bosch-gsb-13-re-drill');
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[1].params, ['%bosch%', '%gsb%', '%13%', '%re%']);
});

test('resolveProductText returns null for a genuinely custom item', async () => {
  const db = {
    async query(sql) {
      if (/LOWER\(slug\)/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
  assert.equal(await resolveProductText(db, 'Custom stainless steel gate 12ft'), null);
  assert.equal(await resolveProductText(db, ''), null);
});
