// Brand directory data shaping, kept pure for tests (counts, alphabetical order, junk).
export function brandSummary(products) {
  const counts = new Map();
  for (const p of Array.isArray(products) ? products : []) {
    const name = String((p && p.brand) || '').trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
