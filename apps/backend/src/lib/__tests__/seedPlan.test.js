const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PRODUCT_COLUMNS, PRODUCT_UPSERT_SQL, productParams,
  COUPON_COLUMNS, COUPON_UPSERT_SQL, couponParams,
} = require('../seedPlan');

test('product seed upserts descriptive fields on re-run', () => {
  assert.match(PRODUCT_UPSERT_SQL, /ON CONFLICT \(slug\) DO UPDATE SET/);
  for (const col of ['name', 'price_paise', 'mrp_paise', 'images', 'videos', 'specs', 'hsn', 'brand', 'category']) {
    assert.match(PRODUCT_UPSERT_SQL, new RegExp(`${col} = EXCLUDED\\.${col}`), `missing update for ${col}`);
  }
});

test('product seed never overwrites live stock', () => {
  assert.doesNotMatch(PRODUCT_UPSERT_SQL, /stock\s*=\s*EXCLUDED\.stock/);
});

test('product params line up with the column list and keep stock as given', () => {
  const p = {
    slug: 'x-drill', name: 'X Drill', brand: 'X', category: 'power-tools',
    price_paise: 100000, mrp_paise: 120000, hsn: '84672100', stock: 7,
    specs: { power: '500W' }, images: ['/images/x-drill.svg'],
  };
  const params = productParams(p);
  assert.equal(params.length, PRODUCT_COLUMNS.length);
  assert.equal(params[PRODUCT_COLUMNS.indexOf('stock')], 7);
  assert.equal(params[PRODUCT_COLUMNS.indexOf('specs')], JSON.stringify({ power: '500W' }));
  // optional videos default to an empty array rather than undefined
  assert.deepEqual(params[PRODUCT_COLUMNS.indexOf('videos')], []);
});

test('coupon seed refreshes terms but protects usage and enabled state', () => {
  assert.match(COUPON_UPSERT_SQL, /ON CONFLICT \(code\) DO UPDATE SET/);
  assert.match(COUPON_UPSERT_SQL, /pct_off = EXCLUDED\.pct_off/);
  assert.doesNotMatch(COUPON_UPSERT_SQL, /used_count\s*=/);
  assert.doesNotMatch(COUPON_UPSERT_SQL, /active\s*=\s*EXCLUDED\.active/);
  const params = couponParams({ code: 'W10', pct_off: 10, max_discount_paise: 50000, min_order_paise: 99900, active: true });
  assert.equal(params.length, COUPON_COLUMNS.length);
});
