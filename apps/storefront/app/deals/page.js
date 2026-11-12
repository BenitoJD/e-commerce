import DealsView from '../../components/DealsView';
import { getProductsForMeta, paiseToRupees, absoluteUrl } from '../../lib/serverApi';
import { breadcrumbJsonLd } from '../../lib/jsonld';
import { pickDeals } from '../../lib/deals';
import { STORE } from '../../lib/store';

// Deals is an indexed landing page, so the 20%+ list is rendered on the server; the
// countdown stays client-side (it depends on the visitor's clock).
function toDealItems(products) {
  return pickDeals(products.map((p) => ({
    ...p,
    price: paiseToRupees(p.price_paise),
    mrp: paiseToRupees(p.mrp_paise),
  })));
}

export async function generateMetadata() {
  const deals = toDealItems(await getProductsForMeta('', 40));
  const maxOff = deals.length ? deals[0].discountPct : 0;
  const title = maxOff
    ? `Deals of the Day — up to ${maxOff}% off tools | ${STORE.name}`
    : `Deals of the Day | ${STORE.name}`;
  const description = `Today's discounts on power tools, motors, pumps and machinery — ${deals.length} products at 20%+ off with GST invoice, EMI and pan-India delivery.`;
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl('/deals') },
    openGraph: { title, description, url: absoluteUrl('/deals') },
  };
}

export default async function DealsPage() {
  const items = toDealItems(await getProductsForMeta('', 100));

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Deals of the Day at ${STORE.name}`,
    itemListElement: items.slice(0, 20).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absoluteUrl(`/product/${encodeURIComponent(p.slug)}`),
      name: p.name,
    })),
  }).replace(/</g, '\\u003c');

  return (
    <>
      {items.length ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} /> : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', url: absoluteUrl('/') },
            { name: 'Deals', url: absoluteUrl('/deals') },
          ]),
        }}
      />
      <DealsView initialItems={items} />
    </>
  );
}
