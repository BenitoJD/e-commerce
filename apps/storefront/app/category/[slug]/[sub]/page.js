// Two-level category browsing: /category/pumps/submersible.
//
// The reference store nests categories the same way, so these URLs are part of parity: they
// keep parent and child pages distinct for SEO, breadcrumbs and filters while the parent page
// still lists everything underneath it.
import CategoryView from '../../../../components/CategoryView';
import { getProductsPage, getProductsForMeta, getCategoriesForMeta, paiseToRupees, absoluteUrl } from '../../../../lib/serverApi';
import { breadcrumbJsonLd } from '../../../../lib/jsonld';
import { STORE } from '../../../../lib/store';

const PAGE_SIZE = 40;

function humanize(slug) {
  return String(slug || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function findNode(tree, parentSlug, childSlug) {
  const parent = (tree || []).find((c) => c.slug === parentSlug);
  if (!parent) return { parent: null, child: null };
  const child = (parent.children || []).find((k) => k.slug === childSlug);
  return { parent, child: child || null };
}

export async function generateMetadata({ params, searchParams }) {
  const parentSlug = decodeURIComponent(params.slug || '');
  const childSlug = decodeURIComponent(params.sub || '');
  const query = String((searchParams && searchParams.q) || '').trim();
  const canonical = absoluteUrl(`/category/${encodeURIComponent(parentSlug)}/${encodeURIComponent(childSlug)}`);

  if (query) {
    return {
      title: `Search: ${query} | ${STORE.name}`,
      description: `Products matching "${query}" at ${STORE.name}.`,
      robots: { index: false, follow: true },
      alternates: { canonical },
    };
  }

  const tree = await getCategoriesForMeta();
  const { parent, child } = findNode(tree, parentSlug, childSlug);
  const label = child ? child.label : `${humanize(parentSlug)} ${humanize(childSlug)}`;
  const path = `${parentSlug}/${childSlug}`;

  const items = await getProductsForMeta(path, 8);
  const prices = items.map((p) => paiseToRupees(p.price_paise)).filter((n) => n > 0);
  const from = prices.length ? Math.min(...prices) : null;
  const brands = [...new Set(items.map((p) => p.brand).filter(Boolean))].slice(0, 3).join(', ');
  const title = from
    ? `${label} — Buy Online from ₹${from.toLocaleString('en-IN')} | ${STORE.name}`
    : `${label} — Buy Online | ${STORE.name}`;
  const description = [
    `Shop ${label.toLowerCase()} online at ${STORE.name}`,
    parent ? `part of our ${parent.label} range` : null,
    from ? `prices from ₹${from.toLocaleString('en-IN')}` : null,
    brands ? `brands like ${brands}` : null,
    'GST invoice, EMI, UPI and pan-India delivery.',
  ].filter(Boolean).join(' — ');

  return {
    title,
    description: description.slice(0, 300),
    alternates: { canonical },
    openGraph: { title, description: description.slice(0, 300), url: canonical },
    // A child page whose slug no longer exists should not be indexed as an empty category.
    ...(child ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function SubCategoryPage({ params, searchParams }) {
  const parentSlug = decodeURIComponent(params.slug || '');
  const childSlug = decodeURIComponent(params.sub || '');
  const initialQ = (searchParams && searchParams.q) || '';
  const path = `${parentSlug}/${childSlug}`;

  const [tree, { items, total }] = await Promise.all([
    getCategoriesForMeta(),
    getProductsPage(path, PAGE_SIZE, initialQ),
  ]);
  const { parent, child } = findNode(tree, parentSlug, childSlug);
  const parentLabel = parent ? parent.label : humanize(parentSlug);
  const childLabel = child ? child.label : humanize(childSlug);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', url: absoluteUrl('/') },
            { name: parentLabel, url: absoluteUrl(`/category/${encodeURIComponent(parentSlug)}`) },
            { name: childLabel, url: absoluteUrl(`/category/${encodeURIComponent(parentSlug)}/${encodeURIComponent(childSlug)}`) },
          ]),
        }}
      />
      <CategoryView
        slug={parentSlug}
        sub={childSlug}
        initialItems={items}
        initialQ={initialQ}
        initialTotal={total}
        parents={tree}
      />
    </>
  );
}
