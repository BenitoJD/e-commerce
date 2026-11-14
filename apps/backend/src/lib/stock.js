// Stock reservation helpers (thin wrappers over pg; logic reviewed, not unit-tested
// because they need a live database, covered by code review + staging checks).
const db = require('../db');

async function withTransaction(fn) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

function insufficient(slug) {
  const e = new Error(`Insufficient stock for ${slug}`);
  e.code = 'INSUFFICIENT_STOCK';
  e.slug = slug;
  return e;
}

// Atomically reserve line items [{slug, qty}]. Throws INSUFFICIENT_STOCK.
async function reserveItems(exec, lineItems) {
  for (const it of lineItems) {
    const qty = parseInt(it.qty, 10) || 0;
    const { rows } = await exec.query(
      'UPDATE products SET stock = stock - $1 WHERE slug = $2 AND stock >= $1 RETURNING slug, stock',
      [qty, it.slug]
    );
    if (!rows.length) throw insufficient(it.slug);
  }
}

// Best-effort release (restock), never throws; logs failures.
async function releaseItems(exec, lineItems) {
  for (const it of (lineItems || [])) {
    const qty = parseInt(it.qty, 10) || 0;
    if (!it.slug || qty <= 0) continue;
    try {
      await exec.query('UPDATE products SET stock = stock + $1 WHERE slug = $2', [qty, it.slug]);
    } catch (err) {
      console.error(`[stock] release failed for ${it.slug}:`, err.message);
    }
  }
}

module.exports = { withTransaction, reserveItems, releaseItems };
