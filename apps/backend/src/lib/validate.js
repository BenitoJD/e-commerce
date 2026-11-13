// Input normalisation for public write endpoints.
//
// These are the fields an anonymous visitor controls, so they need clamping rather than
// trust: the old quote endpoint happily stored qty = -5 and a 1 MB "message".

function clampText(value, max, { trim = true, fallback = '' } = {}) {
  let s = value == null ? fallback : String(value);
  if (trim) s = s.trim();
  if (!max || s.length <= max) return s;
  return s.slice(0, max);
}

function clampInt(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, fallback = null } = {}) {
  const n = parseInt(value, 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Indian mobile numbers: accept +91 / 0 prefixes, spaces, dashes. Returns the last 10
// digits when plausible, otherwise an empty string so callers can reject it.
function normalizePhone(value) {
  const digits = String(value == null ? '' : value).replace(/\D/g, '');
  if (digits.length < 10) return '';
  return digits.slice(-10);
}

// GSTIN: 2-digit state code, 5-letter PAN, 4 digits, 1 letter, 1 alphanumeric, 'Z',
// then a mod-36 check character. A wrong GSTIN on a tax invoice means the buyer cannot
// claim input credit, so a typo is worth rejecting at checkout rather than printing it.
const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function normalizeGstin(value) {
  return String(value == null ? '' : value).replace(/[\s-]/g, '').toUpperCase();
}

function gstinChecksum(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const v = GSTIN_CHARS.indexOf(first14[i]);
    if (v < 0) return null;
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

function isValidGstin(value) {
  const s = normalizeGstin(value);
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(s)) return false;
  const state = parseInt(s.slice(0, 2), 10);
  if (!(state >= 1 && state <= 38)) return false; // 01–38 are the assigned state codes
  return gstinChecksum(s.slice(0, 14)) === s[14];
}

module.exports = { clampText, clampInt, normalizePhone, normalizeGstin, isValidGstin };
