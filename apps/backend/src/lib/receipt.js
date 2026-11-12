// Receipt IDs double as the "secret" for /invoice/<receipt> and /store/invoice/:receipt,
// which return customer name/phone/address. They must therefore be unguessable, not just
// unique: the old format (timestamp + 6 digits) allowed enumeration by a patient attacker.
const crypto = require('crypto');

const SLUG_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function toBase36(n) {
  let v = Math.max(0, Math.floor(Number(n) || 0));
  if (v === 0) return '0';
  let out = '';
  while (v > 0) {
    out = SLUG_ALPHABET[v % 36] + out;
    v = Math.floor(v / 36);
  }
  return out;
}

function randomHex(bytes = 8) {
  return crypto.randomBytes(bytes).toString('hex');
}

// rcpt_<base36-ish timestamp part>_<16 hex chars>  (64 bits of randomness)
function makeReceipt(now = Date.now(), random = randomHex) {
  return `rcpt_${toBase36(now)}_${random(8)}`;
}

module.exports = { makeReceipt, toBase36, randomHex };
