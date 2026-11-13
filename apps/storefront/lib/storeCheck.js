// Storefront identity audit.
//
// The store name, phone, email, address and GSTIN default to placeholders so the clone runs
// out of the box. In production those values print on tax invoices and power the WhatsApp
// links — a fake GSTIN on an invoice is a legal problem, and a fake phone sends customers
// nowhere. The storefront has no boot hook, so this warns once from the first server render.
import { STORE } from './store.js';

const PLACEHOLDER_PATTERNS = [
  /^91?9{10}$/,            // 9999999999 style
  /^910000000000$/,        // 0000000000 style
  /placeholder/i,
  /example\.(com|org|net)$/i,
  /^xxxxxxxx/i,
  /toolskart\.(in|com)$/i, // the clone's own demo identity
];

export function looksLikePlaceholder(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return true; // an empty required identity field is just as broken
  return PLACEHOLDER_PATTERNS.some((re) => re.test(v.replace(/\D/g, '')) || re.test(v));
}

// Validates the GSTIN shape/checksum without importing the checkout helper (kept tiny so
// this module stays dependency-free for tests).
export function gstinLooksValid(gstin) {
  const v = String(gstin || '').toUpperCase().trim();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v)) return false;
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = alphabet.indexOf(v[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(value / 36) + (value % 36);
  }
  return alphabet[(36 - (sum % 36)) % 36] === v[14];
}

export function storeWarnings(store = STORE, env = process.env) {
  if (env.NODE_ENV !== 'production') return [];
  const warnings = [];

  if (looksLikePlaceholder(store.phone)) {
    warnings.push('[store] phone is a placeholder — WhatsApp and call links point nowhere. Set NEXT_PUBLIC_STORE_PHONE.');
  }
  if (looksLikePlaceholder(store.email)) {
    warnings.push('[store] email is a placeholder — support mail will bounce. Set NEXT_PUBLIC_STORE_EMAIL.');
  }
  if (!gstinLooksValid(store.gstin)) {
    warnings.push('[store] GSTIN is missing or invalid — tax invoices will not be usable for input credit. Set NEXT_PUBLIC_STORE_GSTIN.');
  }
  if (!store.address || !store.address.trim()) {
    warnings.push('[store] address is empty — invoices will print without a registered address.');
  }
  const siteUrl = String(env.NEXT_PUBLIC_SITE_URL || '');
  if (/localhost|127\.0\.0\.1/.test(siteUrl)) {
    warnings.push('[store] NEXT_PUBLIC_SITE_URL points at localhost — canonicals, sitemap and OG tags will be wrong.');
  }
  return warnings;
}

let warned = false;
export function warnOnce(env = process.env) {
  if (warned) return;
  warned = true;
  const warnings = storeWarnings(STORE, env);
  for (const w of warnings) console.warn(w);
}
