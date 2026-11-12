// Store policies that appear in more than one place.
//
// The COD cap was hardcoded in the pincode helper while checkout read COD_MAX_PAISE, so an
// operator who raised the cap would still see "COD unavailable" on the product page while
// the server accepted the order. One function, one source of truth.
function codMaxPaise(env = process.env) {
  const raw = parseInt(env.COD_MAX_PAISE, 10);
  return Number.isInteger(raw) && raw > 0 ? raw : 2000000; // ₹20,000 default
}

function codAvailableFor(amountPaise, env = process.env) {
  const amount = Number(amountPaise);
  if (!Number.isFinite(amount) || amount <= 0) return true; // no basket context yet
  return amount <= codMaxPaise(env);
}

module.exports = { codMaxPaise, codAvailableFor };
