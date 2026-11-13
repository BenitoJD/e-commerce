import CategoryView from '../../../components/CategoryView';
import { notFound } from 'next/navigation';
import { getProductsPage, getProductsForMeta, getCategoriesForMeta, paiseToRupees, absoluteUrl } from '../../../lib/serverApi';
import { breadcrumbJsonLd } from '../../../lib/jsonld';
import { STORE } from '../../../lib/store';

const PAGE_SIZE = 40;

function humanize(slug) {
  return String(slug || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Category pages are SEO landing pages ("power tools price"), so the first page of
// products is rendered on the server and the client only takes over for filtering.
// Search URLs (?q=) are a different animal: noindex them so they don't compete with the
// category pages as thin duplicates.
export async function generateMetadata({ params, searchParams }) {
  const slug = decodeURIComponent(params.slug || '');
  const query = String((searchParams && searchParams.q) || '').trim();

  // Decide the 404 here: generateMetadata runs before the response is committed, so the
  // status is a real 404. Calling notFound() only in the page body streams a 200 first.
  // Unknown slug: answer with not-found metadata (noindex) — the page body renders the
  // branded 404. Throwing notFound() here would skip the noindex and still stream a 200.
  if (!query && slug !== 'all') {
    const tree = await getCategoriesForMeta();
    if (tree.length && !tree.some((c) => c.slug === slug)) {
      return {
        title: `Category not found — ${STORE.name}`,
        description: 'This category does not exist. Browse all products, deals and brands instead.',
        robots: { index: false, follow: true },
        alternates: { canonical: absoluteUrl(`/category/${encodeURIComponent(slug)}`) },
      };
    }
  }

  if (query) {
    return {
      title: `Search: ${query} | ${STORE.name}`,
      description: `Products matching "${query}" at ${STORE.name} — GST invoice, EMI and pan-India delivery.`,
      robots: { index: false, follow: true },
      alternates: { canonical: absoluteUrl(`/category/${encodeURIComponent(slug)}`) },
    };
  }

  const label = slug === 'all' ? 'All Products' : humanize(slug);
  const items = await getProductsForMeta(slug, 8);
  const prices = items.map((p) => paiseToRupees(p.price_paise)).filter((n) => n > 0);
  const from = prices.length ? Math.min(...prices) : null;
  const brands = [...new Set(items.map((p) => p.brand).filter(Boolean))].slice(0, 3).join(', ');
  const title = from
    ? `${label} — Buy Online from ₹${from.toLocaleString('en-IN')} | ${STORE.name}`
    : `${label} — Buy Online | ${STORE.name}`;
  const description = [
    `Shop ${label.toLowerCase()} online at ${STORE.name}`,
    from ? `prices from ₹${from.toLocaleString('en-IN')}` : null,
    brands ? `brands like ${brands}` : null,
    'GST invoice, EMI, UPI and pan-India delivery.',
  ].filter(Boolean).join(' — ');
  return {
    title,
    description: description.slice(0, 300),
    alternates: { canonical: absoluteUrl(`/category/${encodeURIComponent(slug)}`) },
    openGraph: { title, description: description.slice(0, 300), url: absoluteUrl(`/category/${encodeURIComponent(slug)}`) },
  };
}

export default async function CategoryPage({ params, searchParams }) {
  const slug = decodeURIComponent(params.slug || '');
  const initialQ = (searchParams && searchParams.q) || '';
  // Pass the query so a search URL server-renders its actual results, not the category.
  const [{ items, total }, tree] = await Promise.all([
    getProductsPage(slug, PAGE_SIZE, initialQ),
    getCategoriesForMeta(),
  ]);
  // Unknown category slugs are dead URLs: 404 them instead of rendering an empty,
  // indexable listing. "/category/all" and search results stay valid. (The status is set
  // in generateMetadata; this keeps the body from rendering stale content in dev.)
  const known = slug === 'all'
    || (tree.length > 0 && tree.some((c) => c.slug === slug));
  if (tree.length && !known && !initialQ) notFound();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', url: absoluteUrl('/') },
            { name: slug === 'all' ? 'All Products' : humanize(slug), url: absoluteUrl(`/category/${encodeURIComponent(slug)}`) },
          ]),
        }}
      />
      <CategoryView slug={slug} initialItems={items} initialQ={initialQ} initialTotal={total} parents={tree} />
    </>
  );
}
