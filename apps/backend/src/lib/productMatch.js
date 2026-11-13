// Resolve the free text a buyer types into a bulk-quote product field to a catalogue SKU.
//
// Buyers write "Bosch GSB 13 RE Drill" or "bosch drill", not the exact seeded name
// ("Bosch GSB 13 RE 600W Impact Drill"). Exact/ILIKE matching alone left those quotes with no
// product_slug, so the staff "Convert to order" action could never run. Token scoring keeps
// the matching predictable without a search engine: two or more meaningful tokens must match,
// the best score wins, and ties go to the shorter (more specific) name.
const STOP = new Set([
  'the', 'and', 'for', 'with', 'of', 'a', 'an', 'in', 'to', 'on', 'by', 'or',
  'pc', 'pcs', 'unit', 'units', 'nos', 'no', 'set', 'new', 'inch', 'mm',
]);

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && t.length >= 2 && !STOP.has(t));
}

function scoreProduct(text, product) {
  const wanted = [...new Set(tokens(text))];
  if (!wanted.length || !product) return 0;
  const hay = ` ${String(product.name || '').toLowerCase()} ${String(product.brand || '').toLowerCase()} ${String(product.slug || '').toLowerCase()} `;
  let score = 0;
  let hits = 0;
  for (const token of wanted) {
    if (hay.includes(token)) {
      hits += 1;
      score += token.length >= 4 ? 3 : token.length === 3 ? 2 : 1;
    }
  }
  // One generic hit ("drill") is not enough; require at least two meaningful tokens unless
  // the single token is long enough to identify a product (e.g. "submersible").
  if (hits < 2 && !wanted.some((t) => t.length >= 6 && hay.includes(t))) return 0;
  return score;
}

async function resolveProductText(db, text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  // 1. Exact slug or exact name (fast path, no ambiguity).
  const exact = await db.query(
    'SELECT slug, name, brand FROM products WHERE LOWER(slug) = LOWER($1) OR LOWER(name) = LOWER($1) LIMIT 1',
    [raw]
  );
  if (exact.rows.length) return exact.rows[0];

  // 2. Narrow by the buyer's own words, then score what came back.
  const wanted = tokens(raw).slice(0, 4);
  if (!wanted.length) return null;
  const params = [];
  const clauses = wanted.map((t) => {
    params.push(`%${t}%`);
    const n = params.length;
    return `(name ILIKE $${n} OR brand ILIKE $${n} OR slug ILIKE $${n})`;
  });
  let rows = [];
  try {
    const res = await db.query(
      `SELECT slug, name, brand FROM products WHERE ${clauses.join(' OR ')} LIMIT 25`,
      params
    );
    rows = res.rows;
  } catch {
    return null;
  }
  if (!rows.length) return null;
  const ranked = rows
    .map((p) => ({ p, score: scoreProduct(raw, p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || String(a.p.name).length - String(b.p.name).length);
  return ranked.length ? ranked[0].p : null;
}

module.exports = { resolveProductText, scoreProduct, tokens };
