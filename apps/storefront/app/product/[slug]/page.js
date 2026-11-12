import ProductView from '../../../components/ProductView';
import { getProductForMeta, paiseToRupees, absoluteUrl } from '../../../lib/serverApi';
import { STORE } from '../../../lib/store';

// Metadata + structured data are produced here (server) so crawlers see real product
// content, while <ProductView> stays a client component for cart/wishlist interactivity.

export async function generateMetadata({ params }) {
  const slug = decodeURIComponent(params.slug || '');
  const p = await getProductForMeta(slug);
  if (!p) {
    return {
      title: `Product not found — ${STORE.name}`,
      description: `This product could not be found at ${STORE.name}. Browse power tools, motors, pumps and machinery.`,
      alternates: { canonical: absoluteUrl(`/product/${encodeURIComponent(slug)}`) },
    };
  }
  const price = paiseToRupees(p.price_paise);
  const mrp = paiseToRupees(p.mrp_paise);
  const save = mrp > price ? ` (MRP ₹${mrp.toLocaleString('en-IN')}, save ₹${(mrp - price).toLocaleString('en-IN')})` : '';
  const specs = p.specs && typeof p.specs === 'object'
    ? Object.entries(p.specs).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';
  const title = `${p.name} — ₹${price.toLocaleString('en-IN')} | ${STORE.name}`;
  const description = `Buy ${p.name}${p.brand ? ` by ${p.brand}` : ''} online at ₹${price.toLocaleString('en-IN')}${save}. ${specs ? specs + '. ' : ''}GST invoice, EMI and pan-India delivery.`;
  const image = Array.isArray(p.images) && p.images[0] ? absoluteUrl(p.images[0]) : undefined;
  return {
    title,
    description: description.slice(0, 300),
    alternates: { canonical: absoluteUrl(`/product/${encodeURIComponent(slug)}`) },
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

function productJsonLd(p) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined,
    sku: p.slug,
    hsnCode: p.hsn || undefined,
    image: Array.isArray(p.images) ? p.images.slice(0, 3).map(absoluteUrl) : undefined,
    description: `${p.name}${p.brand ? ` by ${p.brand}` : ''} — GST invoice, EMI and pan-India delivery at ${STORE.name}.`,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: String(paiseToRupees(p.price_paise)),
      availability: Number(p.stock) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: absoluteUrl(`/product/${encodeURIComponent(p.slug)}`),
      seller: { '@type': 'Organization', name: STORE.name },
    },
  };
  // Escape "<" so a product name can never break out of the script tag.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default async function ProductPage({ params }) {
  const slug = decodeURIComponent(params.slug || '');
  const p = await getProductForMeta(slug);
  return (
    <>
      {p ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: productJsonLd(p) }} />
      ) : null}
      <ProductView slug={slug} initialProduct={p} />
    </>
  );
}
