// Pure catalog filtering/sorting used by listing pages. Extracted so the behaviour is
// testable without a browser. Prices are in rupees (the API layer normalises paise).
export function filterProducts(items, opts = {}) {
  const { brand = 'All', q = '', priceMin = '', priceMax = '', sort = 'pop' } = opts || {};
  let list = Array.isArray(items) ? [...items] : [];

  if (brand && brand !== 'All') {
    list = list.filter((p) => p && p.brand === brand);
  }
  const term = String(q || '').trim().toLowerCase();
  if (term) {
    list = list.filter((p) => String((p && p.name) || '').toLowerCase().includes(term));
  }

  // Blank bounds are ignored; non-numeric input is ignored rather than hiding everything.
  const min = Number(priceMin);
  const max = Number(priceMax);
  if (String(priceMin) !== '' && Number.isFinite(min)) {
    list = list.filter((p) => Number(p && p.price) >= min);
  }
  if (String(priceMax) !== '' && Number.isFinite(max)) {
    list = list.filter((p) => Number(p && p.price) <= max);
  }

  if (sort === 'low') list.sort((a, b) => Number(a.price) - Number(b.price));
  else if (sort === 'high') list.sort((a, b) => Number(b.price) - Number(a.price));
  else if (sort === 'off') {
    const off = (p) => {
      const mrp = Number(p && p.mrp);
      const price = Number(p && p.price);
      if (!mrp || mrp <= price) return 0;
      return (mrp - price) / mrp;
    };
    list.sort((a, b) => off(b) - off(a));
  }
  return list;
}
