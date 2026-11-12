// Product structured data (schema.org), kept pure so it can be unit-tested.
//
// Rich results need: name, image, offers (price + availability) and — for star ratings in
// search — aggregateRating backed by real reviews. Emitting a rating we don't have would
// be a policy violation, so it is only included when count > 0.
export function productJsonLd(product, { storeName, absoluteUrl, paiseToRupees, rating = null }) {
  const p = product || {};
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined,
    sku: p.slug,
    hsnCode: p.hsn || undefined,
    image: Array.isArray(p.images) ? p.images.slice(0, 3).map(absoluteUrl) : undefined,
    description: `${p.name}${p.brand ? ` by ${p.brand}` : ''} — GST invoice, EMI and pan-India delivery at ${storeName}.`,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: String(paiseToRupees(p.price_paise)),
      availability: Number(p.stock) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      url: absoluteUrl(`/product/${encodeURIComponent(p.slug)}`),
      seller: { '@type': 'Organization', name: storeName },
    },
  };

  const count = Number(rating && rating.count);
  const avg = Number(rating && rating.avg);
  if (Number.isFinite(count) && count > 0 && Number.isFinite(avg) && avg > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(Math.min(5, Math.round(avg * 10) / 10)),
      reviewCount: String(count),
      bestRating: '5',
      worstRating: '1',
    };
  }

  // Escape "<" so a product name can never break out of the script tag.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
