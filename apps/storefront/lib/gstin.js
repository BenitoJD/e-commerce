// Client-side mirror of the server's GSTIN check (server remains authoritative).
// Catching a typo here saves a round trip and an angry support message about a
// tax invoice the buyer cannot use for input credit.
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function normalizeGstin(value) {
  return String(value == null ? '' : value).replace(/[\s-]/g, '').toUpperCase();
}

export function isValidGstin(value) {
  const s = normalizeGstin(value);
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(s)) return false;
  const state = parseInt(s.slice(0, 2), 10);
  if (!(state >= 1 && state <= 38)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const v = GSTIN_CHARS.indexOf(s[i]);
    if (v < 0) return false;
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === s[14];
}
