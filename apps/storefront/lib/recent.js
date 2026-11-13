// Recently-viewed list shared by the product page (writer) and homepage strip (reader).
//
// The strip existed for many rounds but was always empty: nothing wrote tw_recent.
export function pushRecent(list, item, { max = 8 } = {}) {
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
  return [entry, ...withoutDupes].slice(0, max);
}

function sanitizeRecent(x) {
  if (!x || typeof x !== 'object' || !x.slug) return null;
  const price = Number(x.price);
  return {
    slug: String(x.slug),
    name: String(x.name || x.slug),
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    image: String(x.image || ''),
    brand: String(x.brand || ''),
  };
}

export function parseRecent(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.map(sanitizeRecent).filter(Boolean) : [];
  } catch {
    return [];
  }
}
