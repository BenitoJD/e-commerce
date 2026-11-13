// Builds the category tree (with product counts) from a GROUP BY result.
//
// Pure so the merge logic is testable: the SQL returns one row per (category, subcategory)
// pair, and this turns it into the parent→children shape the storefront navigates.
function buildCategoryTree(rows, categories) {
  const childCounts = new Map();
  const parentCounts = new Map();
  const unknown = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const category = String(row.category || '').trim();
    const subcategory = String(row.subcategory || '').trim();
    const count = Number(row.count) || 0;
    if (!category) continue;
    parentCounts.set(category, (parentCounts.get(category) || 0) + count);
    if (subcategory) childCounts.set(`${category}/${subcategory}`, count);
  }

  const tree = [];
  for (const parent of categories) {
    const children = parent.children.map((child) => ({
      slug: child.slug,
      label: child.label,
      path: `${parent.slug}/${child.slug}`,
      count: childCounts.get(`${parent.slug}/${child.slug}`) || 0,
    }));
    tree.push({
      slug: parent.slug,
      label: parent.label,
      path: parent.slug,
      count: parentCounts.get(parent.slug) || 0,
      children,
    });
  }

  // Keep a note of catalogue rows that don't fit the taxonomy: silently dropping them would
  // hide products from every category page.
  for (const category of parentCounts.keys()) {
    if (!categories.some((c) => c.slug === category)) unknown.push(category);
  }

  return { tree, unknown };
}

module.exports = { buildCategoryTree };
