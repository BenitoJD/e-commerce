// Single source of truth for store contact details.
// Override with NEXT_PUBLIC_STORE_PHONE / _EMAIL / _GSTIN (build args in Docker).
// Defaults are placeholders — replace before going live (see docs/VPS-DEPLOY.md).
function digits(s, fb) {
  const d = String(s == null ? '' : s).replace(/\D/g, '');
  return d || fb;
}

function displayPhone(d) {
  if (/^91\d{10}$/.test(d)) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return d ? `+${d}` : '';
}

const PHONE_DIGITS = digits(process.env.NEXT_PUBLIC_STORE_PHONE, '919999999999');

// Policy mirrors of backend env (see apps/backend/src/lib/policy.js). These must be kept
// in sync with COD_MAX_PAISE / SHIPPING_FEE_PAISE so the UI disables or charges at the
// same point the server does.
export const COD_MAX_RUPEES = (() => {
  const paise = Number(process.env.NEXT_PUBLIC_COD_MAX_PAISE);
  return Number.isFinite(paise) && paise > 0 ? Math.round(paise / 100) : 20000;
})();

export const SHIPPING_FEE_RUPEES = (() => {
  const paise = Number(process.env.NEXT_PUBLIC_SHIPPING_FEE_PAISE);
  return Number.isFinite(paise) && paise > 0 ? Math.round(paise / 100) : 0;
})();

export const FREE_SHIPPING_ABOVE_RUPEES = (() => {
  const paise = Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_ABOVE_PAISE);
  return Number.isFinite(paise) && paise > 0 ? Math.round(paise / 100) : 0;
})();

// What the shopper will be charged for delivery at this subtotal.
export function shippingFor(subtotalRupees) {
  if (!SHIPPING_FEE_RUPEES) return 0;
  if (FREE_SHIPPING_ABOVE_RUPEES > 0 && Number(subtotalRupees) >= FREE_SHIPPING_ABOVE_RUPEES) return 0;
  return SHIPPING_FEE_RUPEES;
}

// Cart messaging about delivery. Tells the shopper how much more unlocks free shipping
// instead of the vague "calculated at checkout" they used to get.
export function shippingHint(payableRupees, {
  fee = SHIPPING_FEE_RUPEES,
  freeAbove = FREE_SHIPPING_ABOVE_RUPEES,
} = {}) {
  const payable = Math.max(0, Number(payableRupees) || 0);
  const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  if (!fee) {
    return { free: true, gapRupees: 0, text: 'Free shipping across India.' };
  }
  if (freeAbove > 0 && payable >= freeAbove) {
    return { free: true, gapRupees: 0, text: `Free shipping unlocked — no delivery charge.` };
  }
  if (freeAbove > payable) {
    return {
      free: false,
      gapRupees: freeAbove - payable,
      text: `Add ${inr(freeAbove - payable)} more for free shipping, otherwise ${inr(fee)} delivery applies.`,
    };
  }
  return { free: false, gapRupees: 0, text: `${inr(fee)} delivery applies to this order.` };
}

export const STORE = {
  name: process.env.NEXT_PUBLIC_STORE_NAME || 'E-Commerce',
  phoneDigits: PHONE_DIGITS,
  phoneDisplay: displayPhone(PHONE_DIGITS),
  email: process.env.NEXT_PUBLIC_STORE_EMAIL || 'care@ecommerce.in',
  gstin: process.env.NEXT_PUBLIC_STORE_GSTIN || '00AAAAA0000A1Z5',
  address: process.env.NEXT_PUBLIC_STORE_ADDRESS || 'Plot 12, MIDC Industrial Area, Pune, Maharashtra 411026',
  // GST state code of the seller. Drives the CGST/SGST vs IGST decision on invoices, so it
  // must be explicit: the placeholder GSTIN above carries an unusable "00" code.
  stateCode: process.env.NEXT_PUBLIC_STORE_STATE_CODE || '27',
};

// COD cap shown to shoppers. Must mirror the backend's COD_MAX_PAISE; both are
// configurable so an operator who raises the cap sees the change in the UI too.
export function waLink(text) {
  const t = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${STORE.phoneDigits}${t}`;
}

// Share a product/page on WhatsApp (wa.me without a number opens the share sheet).
export function waShareLink(text, url) {
  const parts = [text, url].filter(Boolean).join(' ');
  return `https://wa.me/?text=${encodeURIComponent(parts)}`;
}

// Deep link to a *customer's* WhatsApp (admin/support use). Accepts local 10-digit
// numbers, +91-prefixed numbers, and numbers with spaces or dashes.
export function waLinkTo(phone, text) {
  const digits = String(phone == null ? '' : phone).replace(/\D/g, '');
  if (!digits) return null;
  let intl = digits;
  if (intl.length === 10) intl = `91${intl}`;
  else if (intl.length === 11 && intl.startsWith('0')) intl = `91${intl.slice(1)}`;
  else if (intl.length === 12 && intl.startsWith('91')) intl = intl;
  else if (intl.length < 10) return null;
  else if (intl.length > 12) intl = intl.slice(-12);
  return `https://wa.me/${intl}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
