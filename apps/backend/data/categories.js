// Two-level category taxonomy, mapped to the actual 30-product catalogue.
//
// The reference store (toolsvilla.com) navigates nested categories
// (/category/pumps/.../borewell-submersible-pumps), so a flat list of top-level categories
// is a structural difference, not just a naming one. Every product carries a `subcategory`
// slug from this tree; counts, filters, breadcrumbs and the sitemap all derive from here.

const CATEGORIES = [
  {
    slug: 'power-tools',
    label: 'Power Tools',
    children: [
      { slug: 'drills', label: 'Drills & Impact Drills' },
      { slug: 'grinders', label: 'Angle Grinders' },
      { slug: 'saws', label: 'Saws & Cutters' },
      { slug: 'breakers', label: 'Demolition Breakers' },
      { slug: 'routers', label: 'Routers' },
    ],
  },
  {
    slug: 'motors',
    label: 'Motors',
    children: [
      { slug: 'single-phase', label: 'Single Phase Motors' },
      { slug: 'three-phase', label: 'Three Phase Motors' },
    ],
  },
  {
    slug: 'pumps',
    label: 'Pumps',
    children: [
      { slug: 'submersible', label: 'Submersible Pumps' },
      { slug: 'monoblock', label: 'Monoblock Pumps' },
    ],
  },
  {
    slug: 'welding',
    label: 'Welding',
    children: [
      { slug: 'arc-welders', label: 'ARC / MMA Welders' },
      { slug: 'mig-welders', label: 'MIG Welders' },
    ],
  },
  {
    slug: 'cleaning',
    label: 'Cleaning',
    children: [
      { slug: 'pressure-washers', label: 'Pressure Washers' },
      { slug: 'scrubbers', label: 'Scrubber Dryers' },
    ],
  },
  {
    slug: 'agriculture',
    label: 'Agriculture',
    children: [
      { slug: 'sprayers', label: 'Sprayers' },
      { slug: 'brush-cutters', label: 'Brush Cutters' },
      { slug: 'chaff-cutters', label: 'Chaff Cutters' },
    ],
  },
  {
    slug: 'machinery',
    label: 'Machinery',
    children: [
      { slug: 'flour-mills', label: 'Flour Mills' },
      { slug: 'compressors', label: 'Air Compressors' },
      { slug: 'engines', label: 'Engines' },
    ],
  },
];

const BY_PARENT = new Map(CATEGORIES.map((c) => [c.slug, c]));

// Accepts a bare parent slug, a two-segment "parent/child" path, or either half alone.
function resolveCategory(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  const [parentSlug, childSlug] = raw.split('/');
  const parent = BY_PARENT.get(parentSlug);
  if (!parent) {
    // A child slug on its own still resolves, so old links keep working.
    for (const c of CATEGORIES) {
      const child = c.children.find((k) => k.slug === raw);
      if (child) return { parent: c, child, path: `${c.slug}/${child.slug}` };
    }
    return null;
  }
  if (!childSlug) return { parent, child: null, path: parent.slug };
  const child = parent.children.find((k) => k.slug === childSlug);
  if (!child) return null;
  return { parent, child, path: `${parent.slug}/${child.slug}` };
}

// Every slug in the subtree, for "parent view shows its children's products".
function categorySlugs(value) {
  const resolved = resolveCategory(value);
  if (!resolved) return [];
  if (resolved.child) return [resolved.child.slug];
  return resolved.parent.children.map((k) => k.slug);
}

function allCategoryPaths() {
  const paths = [];
  for (const c of CATEGORIES) {
    paths.push(c.slug);
    for (const k of c.children) paths.push(`${c.slug}/${k.slug}`);
  }
  return paths;
}

function labelForPath(value) {
  const resolved = resolveCategory(value);
  if (!resolved) return '';
  return resolved.child ? `${resolved.parent.label} › ${resolved.child.label}` : resolved.parent.label;
}

module.exports = {
  CATEGORIES,
  resolveCategory,
  categorySlugs,
  allCategoryPaths,
  labelForPath,
};
