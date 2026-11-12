// Deals helper kept pure so both the server page and the test can use it without
// pulling in React/Next.
export function discountPct(product) {
  const p = product || {};
  const price = Number(p.price);
  const mrp = Number(p.mrp);
  if (!Number.isFinite(price) || !Number.isFinite(mrp) || mrp <= 0 || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

export const DEAL_THRESHOLD = 20;

export function pickDeals(products, threshold = DEAL_THRESHOLD) {
  return (Array.isArray(products) ? products : [])
    .map((p) => ({ ...p, discountPct: discountPct(p) }))
    .filter((p) => p.discountPct >= threshold)
    .sort((a, b) => b.discountPct - a.discountPct);
}
