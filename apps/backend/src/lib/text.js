// Tiny SQL/text helpers (pure) for list endpoints.
function escapeLike(s) {
  return String(s == null ? '' : s).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function clampInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isInteger(n)) return def;
  return Math.min(Math.max(n, min), max);
}

module.exports = { escapeLike, clampInt };
