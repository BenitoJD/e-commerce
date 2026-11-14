// Product structured data (schema.org), kept pure so it can be unit-tested.
//
// Rich results need: name, image, offers (price + availability) and, for star ratings in
// search, aggregateRating backed by real reviews. Emitting a rating we don't have would
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
    description: `${p.name}${p.brand ? ` by ${p.brand}` : ''}, GST invoice, EMI and pan-India delivery at ${storeName}.`,
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

function escapeForScript(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// Site-level identity. Google uses Organization for brand info and WebSite+SearchAction
// for the "search this site" box in results.
export function organizationJsonLd({ store, siteUrl }) {
  const url = String(siteUrl || '').replace(/\/+$/, '');
  return escapeForScript({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: store.name,
    url,
    logo: `${url}/favicon.svg`,
    email: store.email || undefined,
    contactPoint: store.phoneDigits
      ? [{
        '@type': 'ContactPoint',
        telephone: `+${store.phoneDigits}`,
        contactType: 'customer service',
        areaServed: 'IN',
        availableLanguage: ['en', 'hi'],
      }]
      : undefined,
  });
}

export function websiteJsonLd({ store, siteUrl }) {
  const url = String(siteUrl || '').replace(/\/+$/, '');
  return escapeForScript({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: store.name,
    url,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${url}/category/all?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  });
}

// Breadcrumbs for product/search-result trails. Items are [{ name, url }].
export function breadcrumbJsonLd(items) {
  const list = (Array.isArray(items) ? items : []).filter((i) => i && i.name && i.url);
  return escapeForScript({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: list.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  });
}
