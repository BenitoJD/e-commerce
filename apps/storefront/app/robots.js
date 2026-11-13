// Generated robots.txt — keeps the sitemap URL in sync with NEXT_PUBLIC_SITE_URL,
// so a deploy never ships crawlers a www.example.com sitemap by accident.
export default function robots() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/cart', '/checkout', '/my-orders', '/track-order', '/order-success', '/wishlist', '/compare', '/invoice'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
