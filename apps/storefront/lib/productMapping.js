// Paise → rupee mapping for server-rendered product payloads.
//
// Kept in its own module (no imports) so both the Next server code and the plain-node test
// suite can load it. Server-rendered views read `price`/`mrp` in rupees exactly like the
// client normaliser produces; without this the SSR HTML printed "₹NaN".
export function withRupeePrices(product) {
  if (!product || typeof product !== 'object') return product;
  const out = { ...product };
  if (out.price == null && out.price_paise != null) {
    const n = Number(out.price_paise);
    out.price = Number.isFinite(n) ? Math.round(n / 100) : 0;
  }
  if (out.mrp == null && out.mrp_paise != null) {
    const n = Number(out.mrp_paise);
    out.mrp = Number.isFinite(n) ? Math.round(n / 100) : 0;
  }
  if (!out.image && Array.isArray(out.images) && out.images[0]) out.image = out.images[0];
  if (out.id == null && out.slug) out.id = out.slug;
  return out;
}

export function mapProducts(list) {
  return (Array.isArray(list) ? list : []).map(withRupeePrices);
}
