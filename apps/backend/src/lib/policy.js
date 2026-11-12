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

// Shipping policy. Defaults to free shipping (fee 0): inventing a charge would change
// every price on the site, so the operator opts in with
//   SHIPPING_FEE_PAISE=14900  FREE_SHIPPING_ABOVE_PAISE=499900
function shippingFeePaise(subtotalPaise, env = process.env) {
  const fee = parseInt(env.SHIPPING_FEE_PAISE, 10);
  if (!Number.isInteger(fee) || fee <= 0) return 0;
  const threshold = parseInt(env.FREE_SHIPPING_ABOVE_PAISE, 10);
  const amount = Number(subtotalPaise);
  if (Number.isInteger(threshold) && threshold > 0 && Number.isFinite(amount) && amount >= threshold) {
    return 0;
  }
  return fee;
}

module.exports = { codMaxPaise, codAvailableFor, shippingFeePaise };
