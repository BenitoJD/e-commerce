import { STORE, waLink } from '../lib/store';

// Branded 404. The default Next page drops the shopper out of the store with no way back,
// which is a lost sale; this keeps search, categories and support within reach.
export const metadata = {
  title: 'Page not found',
  description: 'The page you were looking for does not exist. Browse categories or search the catalogue.',
};

const CATEGORIES = [
  ['power-tools', 'Power Tools'],
  ['motors', 'Motors'],
  ['pumps', 'Pumps'],
  ['agriculture', 'Agriculture'],
  ['welding', 'Welding'],
  ['cleaning', 'Cleaning'],
  ['machinery', 'Machinery'],
];

export default function NotFound() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="text-6xl font-black text-[#A95F32]">404</div>
      <h1 className="text-2xl font-extrabold mt-2">We couldn&apos;t find that page</h1>
      <p className="text-gray-600 mt-2">
        The link may be broken or the product may have been renamed. Try searching the catalogue instead.
      </p>

      <form action="/category/all" method="get" className="mt-6 flex gap-2 max-w-md mx-auto">
        <input name="q" placeholder="Search drills, pumps, motors…" className="input" aria-label="Search products" />
        <button className="btn-primary whitespace-nowrap">Search</button>
      </form>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {CATEGORIES.map(([slug, label]) => (
          <a key={slug} href={`/category/${slug}`} className="btn-outline !py-1.5 !px-3 text-xs">
            {label}
          </a>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <a href="/" className="btn-outline">Go to homepage</a>
        <a href={waLink('Hi, I need help finding a product')} target="_blank" rel="noreferrer" className="btn-outline !text-green-700">
          Ask on WhatsApp
        </a>
      </div>

      <p className="text-xs text-gray-400 mt-8">{STORE.name} — machinery &amp; power tools</p>
    </div>
  );
}
