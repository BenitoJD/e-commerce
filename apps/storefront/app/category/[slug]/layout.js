import { getProductsForMeta, paiseToRupees, absoluteUrl } from '../../../lib/serverApi';
import { STORE } from '../../../lib/store';

function humanize(slug) {
  return String(slug || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function generateMetadata({ params }) {
  const slug = decodeURIComponent(params.slug || '');
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

export default function CategoryLayout({ children }) {
  return children;
}
