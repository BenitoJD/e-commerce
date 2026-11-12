import CategoryView from '../../../components/CategoryView';
import { getProductsPage, getProductsForMeta, paiseToRupees, absoluteUrl } from '../../../lib/serverApi';
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
  const { items, total } = await getProductsPage(slug, PAGE_SIZE, initialQ);
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
      <CategoryView slug={slug} initialItems={items} initialQ={initialQ} initialTotal={total} />
    </>
  );
}
