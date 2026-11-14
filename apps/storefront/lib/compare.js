// Product comparison list (localStorage).
//
// The reference store exposes a compare feature, so shoppers can line up two to four tools
// by spec before buying. Kept pure so the de-dupe/cap rules are testable, and small enough
// that a stale entry can never break the page.
export const COMPARE_MAX = 4;
export const COMPARE_KEY = 'tw_compare';

export function pushCompare(list, item, { max = COMPARE_MAX } = {}) {
  const items = Array.isArray(list) ? list.filter((x) => x && x.slug) : [];
  if (!item || !item.slug) return items.slice(0, max);

  const entry = {
    slug: String(item.slug),
    name: item.name || String(item.slug),
    price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0,
    image: item.image || '',
    brand: item.brand || '',
  };

  const withoutDupes = items.filter((x) => String(x.slug) !== entry.slug);
  // Already compared: keep the column where the shopper put it.
  if (withoutDupes.length !== items.length) return items.slice(0, max);
  // Refuse to grow past the cap rather than silently evicting a product the shopper chose.
  if (withoutDupes.length >= max) return withoutDupes;
  return [...withoutDupes, entry];
}

export function removeCompare(list, slug) {
  const items = Array.isArray(list) ? list.filter((x) => x && x.slug) : [];
  return items.filter((x) => String(x.slug) !== String(slug));
}

export function toggleCompare(list, item, { max = COMPARE_MAX } = {}) {
  const items = Array.isArray(list) ? list.filter((x) => x && x.slug) : [];
  if (!item || !item.slug) return items;
  const exists = items.some((x) => String(x.slug) === String(item.slug));
  return exists ? removeCompare(items, item.slug) : pushCompare(items, item, { max });
}

export function parseCompare(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && x.slug)
      .map((x) => ({
        slug: String(x.slug),
        name: String(x.name || x.slug),
        price: Number.isFinite(Number(x.price)) ? Number(x.price) : 0,
        image: String(x.image || ''),
        brand: String(x.brand || ''),
      }))
      .slice(0, COMPARE_MAX);
  } catch {
    return [];
  }
}

// Union of spec keys across products, so the table shows a row for every attribute any
// compared product declares (a product missing it renders "N/A").
export function specRows(products) {
  const keys = new Set();
  for (const p of Array.isArray(products) ? products : []) {
    const specs = (p && p.specs) || {};
    for (const k of Object.keys(specs)) keys.add(k);
  }
  return [...keys].sort();
}
