// First-boot seeding.
//
// The schema is created lazily on the first query, but nothing loaded the catalogue — so a
// fresh `docker compose up` (empty volume) served an empty store until someone remembered
// to run `npm run seed`. This seeds ONLY when the products table is empty: an operator's
// edits, prices and stock are never overwritten by a redeploy.
const products = require('../../data/products');
const couponsData = require('../../data/coupons');
const { PRODUCT_UPSERT_SQL, productParams, COUPON_UPSERT_SQL, couponParams } = require('./seedPlan');

async function seedIfEmpty(db, productsList = products, couponsList = couponsData) {
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM products');
  const existing = rows && rows[0] ? Number(rows[0].n) || 0 : 0;
  if (existing > 0) return { seeded: false, products: existing };

  for (const p of productsList) {
    await db.query(PRODUCT_UPSERT_SQL, productParams(p));
  }
  for (const c of couponsList) {
    await db.query(COUPON_UPSERT_SQL, couponParams(c));
  }
  return { seeded: true, products: productsList.length, coupons: couponsList.length };
}

// Boot hook: never throws (a failed seed must not stop the API serving /health), never
// blocks startup for long, and is skipped under test.
async function seedOnBoot(db, { env = process.env, log = console.log } = {}) {
  if (env.NODE_ENV === 'test' || env.SEED_ON_BOOT === 'false') return { seeded: false, skipped: true };
  try {
    const result = await seedIfEmpty(db);
    if (result.seeded) {
      log(`[seed] empty catalogue — seeded ${result.products} products and ${result.coupons} coupons`);
    } else {
      log(`[seed] catalogue already has ${result.products} products — not seeding`);
    }
    return result;
  } catch (err) {
    log(`[seed] skipped (${err && err.message})`);
    return { seeded: false, error: err && err.message };
  }
}

module.exports = { seedIfEmpty, seedOnBoot };
