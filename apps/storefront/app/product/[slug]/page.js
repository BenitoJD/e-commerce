import ProductView from '../../../components/ProductView';
import { notFound } from 'next/navigation';
import { getProductForMeta, getRatingForMeta, paiseToRupees, absoluteUrl } from '../../../lib/serverApi';
import { productJsonLd, breadcrumbJsonLd } from '../../../lib/jsonld';
import { STORE } from '../../../lib/store';
import { canonicalUrl } from '../../../lib/seo';

// Metadata + structured data are produced here (server) so crawlers see real product
// content, while <ProductView> stays a client component for cart/wishlist interactivity.

function humanize(slug) {
  return String(slug || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function generateMetadata({ params }) {
  const slug = decodeURIComponent(params.slug || '');
  const p = await getProductForMeta(slug);
  if (!p) {
    return {
      title: `Product not found, ${STORE.name}`,
      description: `This product could not be found at ${STORE.name}. Browse power tools, motors, pumps and machinery.`,
      // Next streams this dynamic route (status stays 200) so the body shows the branded
      // 404; noindex keeps the dead URL out of the index regardless.
      robots: { index: false, follow: true },
      alternates: { canonical: canonicalUrl(`/product/${encodeURIComponent(slug)}`) },
    };
  }
  const price = paiseToRupees(p.price_paise);
  const mrp = paiseToRupees(p.mrp_paise);
  const save = mrp > price ? ` (MRP ₹${mrp.toLocaleString('en-IN')}, save ₹${(mrp - price).toLocaleString('en-IN')})` : '';
  const specs = p.specs && typeof p.specs === 'object'
    ? Object.entries(p.specs).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';
  const title = `${p.name}, ₹${price.toLocaleString('en-IN')} | ${STORE.name}`;
  const description = `Buy ${p.name}${p.brand ? ` by ${p.brand}` : ''} online at ₹${price.toLocaleString('en-IN')}${save}. ${specs ? specs + '. ' : ''}GST invoice, EMI and pan-India delivery.`;
  const image = Array.isArray(p.images) && p.images[0] ? absoluteUrl(p.images[0]) : undefined;
  return {
    title,
    description: description.slice(0, 300),
    alternates: { canonical: canonicalUrl(`/product/${encodeURIComponent(slug)}`) },
    openGraph: {
      title,
      description: description.slice(0, 300),
      type: 'website',
      url: absoluteUrl(`/product/${encodeURIComponent(slug)}`),
      images: image ? [{ url: image }] : undefined,
    },
    twitter: { card: 'summary_large_image', title, description: description.slice(0, 200) },
  };
}

export default async function ProductPage({ params }) {
  const slug = decodeURIComponent(params.slug || '');
  const [p, rating] = await Promise.all([getProductForMeta(slug), getRatingForMeta(slug)]);
  // A slug the catalogue doesn't know is a dead URL: answer 404 with the branded page rather
  // than rendering a product shell around nothing.
  if (!p) notFound();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: productJsonLd(p, { storeName: STORE.name, absoluteUrl, paiseToRupees, rating }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', url: absoluteUrl('/') },
            { name: humanize(p.category || 'all'), url: absoluteUrl(`/category/${encodeURIComponent(p.category || 'all')}`) },
            { name: p.name, url: absoluteUrl(`/product/${encodeURIComponent(p.slug)}`) },
          ]),
        }}
      />
      <ProductView slug={slug} initialProduct={p} />
    </>
  );
}
