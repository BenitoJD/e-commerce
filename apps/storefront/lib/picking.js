// Consolidate several orders into one warehouse picking list.
//
// Picking is per-SKU, not per-order: the person with a trolley wants "12 × Bosch drill"
// once, not the same line across six orders. Pure so the aggregation is testable.
export function aggregatePicking(orders) {
  const bySlug = new Map();
  let orderCount = 0;

  for (const order of Array.isArray(orders) ? orders : []) {
    if (!order) continue;
    orderCount += 1;
    const items = Array.isArray(order.items) ? order.items : [];
    for (const it of items) {
      if (!it || !it.slug) continue;
      const qty = Number(it.qty) || 0;
      if (qty <= 0) continue;
      const key = String(it.slug);
      const existing = bySlug.get(key) || {
        slug: key,
        name: it.name || key,
        hsn: it.hsn || '',
        qty: 0,
        lines: 0,
      };
      existing.qty += qty;
      existing.lines += 1;
      if (!existing.name || existing.name === key) existing.name = it.name || existing.name;
      if (!existing.hsn && it.hsn) existing.hsn = it.hsn;
      bySlug.set(key, existing);
    }
  }

  const rows = [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
  const totalUnits = rows.reduce((n, r) => n + r.qty, 0);
  return { orderCount, rows, totalUnits };
}
