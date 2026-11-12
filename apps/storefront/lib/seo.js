// Canonical URL helper.
//
// A canonical pointing at localhost is worse than no canonical: it tells Google the real
// page lives at http://localhost:3000, which it cannot index. So we only emit one when
// NEXT_PUBLIC_SITE_URL looks like a real public origin.
export function canonicalUrl(pathname, siteUrl = process.env.NEXT_PUBLIC_SITE_URL) {
  const base = String(siteUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) return undefined;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(base)) return undefined;
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${p}`;
}
