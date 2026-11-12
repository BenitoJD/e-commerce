import { brandSummary } from '../../lib/brands';
import { getProductsForMeta, absoluteUrl } from '../../lib/serverApi';
import { breadcrumbJsonLd } from '../../lib/jsonld';
import { STORE } from '../../lib/store';

// Directory page: server-rendered so every brand link is in the initial HTML, which is
// how crawlers discover /brand/<name> pages without relying on the sitemap alone.
export async function generateMetadata() {
  const products = await getProductsForMeta('', 100);
  const brands = brandSummary(products);
  const title = `Shop by Brand — ${brands.length} tool brands | ${STORE.name}`;
  const description = `Browse ${brands.length} genuine brands — ${brands.slice(0, 6).map((b) => b.name).join(', ')} and more. GST invoice, warranty support and pan-India delivery.`;
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl('/brands') },
    openGraph: { title, description, url: absoluteUrl('/brands') },
  };
}

export default async function BrandsPage() {
  const products = await getProductsForMeta('', 100);
  const brands = brandSummary(products);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', url: absoluteUrl('/') },
            { name: 'Brands', url: absoluteUrl('/brands') },
          ]),
        }}
      />
      <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-2">
        <a href="/" className="hover:text-[#F97316]">Home</a>
        <span className="mx-1">/</span>
        <span className="text-gray-700">Brands</span>
      </nav>

      <h1 className="text-3xl font-extrabold">Shop by Brand</h1>
      <p className="text-sm text-gray-500 mt-1">
        {brands.length} genuine brand{brands.length === 1 ? '' : 's'} with GST invoice &amp; warranty support.
      </p>

      {brands.length === 0 ? (
        <p className="mt-8 text-gray-500">No brands found right now.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {brands.map((b) => (
            <a key={b.name} href={`/brand/${encodeURIComponent(b.name)}`} className="card p-6 text-center hover:border-[#F97316]">
              <div className="w-12 h-12 mx-auto rounded-xl bg-orange-100 text-[#EA580C] grid place-items-center font-black text-xl">{b.name[0]}</div>
              <div className="mt-3 font-extrabold">{b.name}</div>
              <div className="text-xs text-gray-500">{b.count} product{b.count > 1 ? 's' : ''}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
