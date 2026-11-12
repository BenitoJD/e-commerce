import BrandView from '../../../components/BrandView';
import { getProductsForMeta, absoluteUrl } from '../../../lib/serverApi';
import { breadcrumbJsonLd } from '../../../lib/jsonld';
import { STORE } from '../../../lib/store';

// Brand pages are indexed ("Bosch tools price"), so the first page renders on the server.

export async function generateMetadata({ params }) {
  const name = decodeURIComponent(params.name || '');
  const title = `${name} Products — Buy Online at ${STORE.name}`;
  const description = `Genuine ${name} tools and equipment with GST invoice, warranty support, EMI and pan-India delivery at ${STORE.name}.`;
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(`/brand/${encodeURIComponent(name)}`) },
    openGraph: { title, description, url: absoluteUrl(`/brand/${encodeURIComponent(name)}`) },
  };
}

export default async function BrandPage({ params }) {
  const name = decodeURIComponent(params.name || '');
  // getProductsForMeta takes a category; for brands we fetch the catalog and filter.
  const all = await getProductsForMeta('', 100);
  const items = all.filter((p) => String(p.brand || '').toLowerCase() === name.toLowerCase());
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', url: absoluteUrl('/') },
            { name: 'Brands', url: absoluteUrl('/brands') },
            { name, url: absoluteUrl(`/brand/${encodeURIComponent(name)}`) },
          ]),
        }}
      />
      <BrandView name={name} initialItems={items} />
    </>
  );
}
