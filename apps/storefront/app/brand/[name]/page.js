import BrandView from '../../../components/BrandView';
import { getBrandPage, absoluteUrl } from '../../../lib/serverApi';
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
  // Brand filter server-side: filtering a 100-product page would silently truncate large brands.
  // The first page size matches the client's PAGE constant so "Load more" lines up.
  const { items, total } = await getBrandPage(name, 40);
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
      <BrandView name={name} initialItems={items} initialTotal={total} />
    </>
  );
}
