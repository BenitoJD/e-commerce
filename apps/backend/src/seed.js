require('dotenv').config();
const db = require('./db');
const products = require('../data/products');
const coupons = require('../data/coupons');
const { PRODUCT_UPSERT_SQL, productParams, COUPON_UPSERT_SQL, couponParams } = require('./lib/seedPlan');

// Repeatable seed: refresh catalogue content, never touch live stock or coupon usage.
async function main() {
  for (const p of products) {
    await db.query(PRODUCT_UPSERT_SQL, productParams(p));
  }
  const r = await db.query('SELECT COUNT(*)::int AS n FROM products');
  console.log(`[seed] products upserted: ${products.length}, table count = ${r.rows[0].n}`);

  for (const c of coupons) {
    await db.query(COUPON_UPSERT_SQL, couponParams(c));
  }
  const rc = await db.query('SELECT COUNT(*)::int AS n FROM coupons');
  console.log(`[seed] coupons upserted: ${coupons.length}, table count = ${rc.rows[0].n}`);
  await db.pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
