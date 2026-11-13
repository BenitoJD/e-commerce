// Seed statements live here so their shape can be unit-tested without a database.
//
// Two rules encoded below:
//  1. Descriptive product fields are REFRESHED on re-seed (price/name/image fixes must
//     reach an existing deployment).
//  2. `stock` is NEVER overwritten — live inventory belongs to the operator, and a
//     re-seed must not silently restock sold-out items.

const PRODUCT_COLUMNS = ['slug', 'name', 'brand', 'category', 'subcategory', 'price_paise', 'mrp_paise', 'hsn', 'stock', 'specs', 'images', 'videos'];

const PRODUCT_UPSERT_SQL = `INSERT INTO products (${PRODUCT_COLUMNS.join(', ')}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         brand = EXCLUDED.brand,
         category = EXCLUDED.category,
         subcategory = EXCLUDED.subcategory,
         price_paise = EXCLUDED.price_paise,
         mrp_paise = EXCLUDED.mrp_paise,
         hsn = EXCLUDED.hsn,
         specs = EXCLUDED.specs,
         images = EXCLUDED.images,
         videos = EXCLUDED.videos`;

function productParams(p) {
  return [
    p.slug,
    p.name,
    p.brand,
    p.category,
    p.subcategory || null,
    p.price_paise,
    p.mrp_paise,
    p.hsn,
    p.stock,
    JSON.stringify(p.specs || {}),
    p.images || [],
    p.videos || [],
  ];
}

const COUPON_COLUMNS = ['code', 'pct_off', 'max_discount_paise', 'min_order_paise', 'active'];

// Coupons: terms are refreshed, but `used_count` and `active` are left untouched so a
// re-seed cannot reset usage caps or un-pause a coupon the operator disabled.
const COUPON_UPSERT_SQL = `INSERT INTO coupons (${COUPON_COLUMNS.join(', ')})
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (code) DO UPDATE SET
         pct_off = EXCLUDED.pct_off,
         max_discount_paise = EXCLUDED.max_discount_paise,
         min_order_paise = EXCLUDED.min_order_paise`;

function couponParams(c) {
  return [c.code, c.pct_off, c.max_discount_paise, c.min_order_paise, c.active];
}

module.exports = {
  PRODUCT_COLUMNS,
  PRODUCT_UPSERT_SQL,
  productParams,
  COUPON_COLUMNS,
  COUPON_UPSERT_SQL,
  couponParams,
};
