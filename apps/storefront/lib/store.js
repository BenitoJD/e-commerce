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

export const STORE = {
  name: process.env.NEXT_PUBLIC_STORE_NAME || 'ToolsKart',
  phoneDigits: PHONE_DIGITS,
  phoneDisplay: displayPhone(PHONE_DIGITS),
  email: process.env.NEXT_PUBLIC_STORE_EMAIL || 'care@toolskart.in',
  gstin: process.env.NEXT_PUBLIC_STORE_GSTIN || '00AAAAA0000A1Z5',
};

export function waLink(text) {
  const t = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${STORE.phoneDigits}${t}`;
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
