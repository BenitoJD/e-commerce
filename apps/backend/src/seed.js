require('dotenv').config();
const db = require('./db');

const products = require('../data/products');

async function main() {
  for (const p of products) {
    await db.query(
      `INSERT INTO products (slug, name, brand, category, price_paise, mrp_paise, hsn, stock, specs, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (slug) DO NOTHING`,
      [p.slug, p.name, p.brand, p.category, p.price_paise, p.mrp_paise, p.hsn, p.stock, JSON.stringify(p.specs), p.images]
    );
  }
  const r = await db.query('SELECT COUNT(*)::int AS n FROM products');
  console.log(`[seed] done. products count = ${r.rows[0].n}`);
  await db.pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
