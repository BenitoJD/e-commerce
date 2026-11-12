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

module.exports = { clampText, clampInt, normalizePhone };
