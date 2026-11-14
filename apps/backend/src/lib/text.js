// Tiny SQL/text helpers (pure) for list endpoints.
function escapeLike(s) {
  return String(s == null ? '' : s).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function clampInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isInteger(n)) return def;
  return Math.min(Math.max(n, min), max);
}

// Allowlisted ORDER BY fragments only, user input can never reach SQL as code.
function sortClause(sort) {
  if (sort === 'low') return 'price_paise ASC, id DESC';
  if (sort === 'high') return 'price_paise DESC, id DESC';
  if (sort === 'off') {
    // Biggest discount first; NULLIF guards a zero MRP.
    return '((mrp_paise - price_paise)::numeric / NULLIF(mrp_paise, 0)) DESC NULLS LAST, id DESC';
  }
  return 'created_at DESC, id DESC';
}

module.exports = { escapeLike, clampInt, sortClause };
