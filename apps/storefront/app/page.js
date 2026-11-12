import HomeView from '../components/HomeView';
import { organizationJsonLd, websiteJsonLd } from '../lib/jsonld';
import { getProductsForMeta, paiseToRupees, absoluteUrl } from '../lib/serverApi';
import { STORE } from '../lib/store';

// The homepage is the top landing page for organic traffic, so its catalogue strips
// are rendered on the server (crawlers see real products, not a spinner) while the
// client keeps cart/wishlist/recently-viewed interactivity.
export async function generateMetadata() {
  const items = await getProductsForMeta('', 6);
  const prices = items.map((p) => paiseToRupees(p.price_paise)).filter((n) => n > 0);
  const from = prices.length ? Math.min(...prices) : null;
  const title = from
    ? `${STORE.name} — Machinery & Power Tools Online from ₹${from.toLocaleString('en-IN')}`
    : `${STORE.name} — India's Machinery & Power Tools Store`;
  const description = 'Buy power tools, motors, pumps, agriculture equipment, welders and cleaning machines online in India. GST invoice, EMI, UPI and pan-India delivery.';
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl('/') },
    openGraph: { title, description, type: 'website', url: absoluteUrl('/') },
  };
}

function itemListJsonLd(items) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${STORE.name} bestsellers`,
    itemListElement: items.slice(0, 10).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absoluteUrl(`/product/${encodeURIComponent(p.slug)}`),
      name: p.name,
    })),
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default async function HomePage() {
  const products = await getProductsForMeta('', 24);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
  return (
    <>
      {/* Site identity: brand info + the "search this site" box in Google results. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizationJsonLd({ store: STORE, siteUrl }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: websiteJsonLd({ store: STORE, siteUrl }) }} />
      {products.length ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: itemListJsonLd(products) }} />
      ) : null}
      <HomeView initialProducts={products} />
    </>
  );
}
