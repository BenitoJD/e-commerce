import { getBrandsForMeta, absoluteUrl } from '../../lib/serverApi';
import BrandDirectory from '../../components/BrandDirectory';
import { breadcrumbJsonLd } from '../../lib/jsonld';
import { STORE } from '../../lib/store';
import { canonicalUrl } from '../../lib/seo';

// Directory page: server-rendered so every brand link is in the initial HTML, which is
// how crawlers discover /brand/<name> pages without relying on the sitemap alone.
export async function generateMetadata() {
  const brands = await getBrandsForMeta();
  const title = `Shop by Brand — ${brands.length} machinery, tool & furniture brands | ${STORE.name}`;
  const description = `Browse ${brands.length} genuine brands — ${brands.slice(0, 6).map((b) => b.name).join(', ')} and more. Machinery, tools and handcrafted furniture with GST invoice, warranty support and pan-India delivery.`;
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl('/brands') },
    openGraph: { title, description, url: absoluteUrl('/brands') },
  };
}

export default async function BrandsPage() {
  const brands = await getBrandsForMeta();

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
      <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-0">
        <a href="/" className="hover:text-[#A95F32]">Home</a>
        <span className="mx-1">/</span>
        <span className="text-gray-700">Brands</span>
      </nav>

      <BrandDirectory brands={brands} />
    </div>
  );
}
