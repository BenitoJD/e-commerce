import DealsView from '../../components/DealsView';
import { getDealsForMeta, paiseToRupees, absoluteUrl } from '../../lib/serverApi';
import { breadcrumbJsonLd } from '../../lib/jsonld';
import { pickDeals } from '../../lib/deals';
import { STORE } from '../../lib/store';

// Deals come from SQL (discount computed and ordered server-side), so nothing beyond the
// first product page can be missed. The countdown stays client-side.
function toDealItems(rows) {
  const mapped = rows.map((p) => ({
    ...p,
    price: paiseToRupees(p.price_paise),
    mrp: paiseToRupees(p.mrp_paise),
  }));
  return pickDeals(mapped);
}

export async function generateMetadata() {
  const deals = toDealItems(await getDealsForMeta(20, 40));
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
  const items = toDealItems(await getDealsForMeta(20, 60));

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
