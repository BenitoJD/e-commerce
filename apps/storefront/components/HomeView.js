'use client';

import { useEffect, useState } from 'react';
import { fetchProducts, asList } from '../lib/api';
import { parseRecent } from '../lib/recent';

const FALLBACK = [
  { slug: 'bosch-gsb-13-re-drill', name: 'Bosch GSB 13 RE Impact Drill 600W', price: 3499, mrp: 4995, brand: 'Bosch', category: 'power-tools', image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&q=80' },
  { slug: 'crompton-1hp-motor', name: 'Crompton 1HP Single Phase Motor', price: 7299, mrp: 8999, brand: 'Crompton', category: 'motors', image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&q=80' },
  { slug: 'honda-agri-sprayer', name: 'Honda Type 4-Stroke Power Sprayer', price: 12499, mrp: 14999, brand: 'Honda', category: 'agriculture', image: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=600&q=80' },
  { slug: 'ibell-arc-welder-200a', name: 'iBell ARC 200A Inverter Welder', price: 5499, mrp: 7999, brand: 'iBell', category: 'welding', image: 'https://images.unsplash.com/photo-1537462715879-360eeb61a0ad?w=600&q=80' },
  { slug: 'karcher-hp-washer', name: 'Karcher Type High Pressure Washer 1400W', price: 8999, mrp: 11999, brand: 'Karcher', category: 'cleaning', image: 'https://images.unsplash.com/photo-1558317374-067fb8f30001?w=600&q=80' },
  { slug: 'stanley-angle-grinder', name: 'Stanley 4-inch Angle Grinder 850W', price: 2899, mrp: 3950, brand: 'Stanley', category: 'power-tools', image: 'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=600&q=80' },
  { slug: 'havells-water-pump', name: 'Havells 1.5HP Self-Priming Pump', price: 9499, mrp: 11500, brand: 'Havells', category: 'motors', image: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=600&q=80' },
  { slug: 'bosch-plunge-router', name: 'Bosch Plunge Router 1200W', price: 7999, mrp: 10200, brand: 'Bosch', category: 'power-tools', image: 'https://images.unsplash.com/photo-1616401784845-180882ba9ba8?w=600&q=80' }
];

const CATS = [
  { slug: 'power-tools', name: 'Power Tools', img: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=500&q=70' },
  { slug: 'motors', name: 'Motors', img: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=500&q=70' },
  { slug: 'agriculture', name: 'Agriculture', img: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=500&q=70' },
  { slug: 'welding', name: 'Welding', img: 'https://images.unsplash.com/photo-1537462715879-360eeb61a0ad?w=500&q=70' },
  { slug: 'cleaning', name: 'Cleaning', img: 'https://images.unsplash.com/photo-1558317374-067fb8f30001?w=500&q=70' }
];

function off(p) {
  if (!p.mrp || p.mrp <= p.price) return null;
  return Math.round(((p.mrp - p.price) / p.mrp) * 100);
}

function Card({ p }) {
  return (
    <a href={`/product/${p.slug || p.id}`} className="card">
      <div className="relative">
        <img src={p.image || p.images?.[0] || 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&q=70'} alt={p.name} className="h-40 w-full object-cover" loading="lazy" />
        {off(p) && <span className="badge bg-green-600 text-white absolute top-2 left-2">{off(p)}% OFF</span>}
        {p.stock === 0 ? <span className="badge bg-gray-800 text-white absolute bottom-2 left-2">Out of Stock</span> : null}
      </div>
      <div className="p-3">
        <div className="text-xs text-gray-500 font-semibold">{p.brand || ''}</div>
        <div className="text-sm font-bold line-clamp-2 min-h-[2.5rem]">{p.name}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-extrabold text-lg">₹{Number(p.price).toLocaleString('en-IN')}</span>
          {p.mrp && <span className="text-xs text-gray-400 line-through">₹{Number(p.mrp).toLocaleString('en-IN')}</span>}
        </div>
      </div>
    </a>
  );
}

export default function HomeView({ initialProducts = null }) {
  const seeded = Array.isArray(initialProducts) && initialProducts.length;
  const [products, setProducts] = useState(seeded ? initialProducts : FALLBACK);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (seeded) return; // server already supplied the catalogue for SEO + first paint
      try {
        const live = await fetchProducts({ limit: 24 });
        const list = asList(live);
        if (alive && list.length) setProducts(list);
      } catch { /* keep fallback */ }
    }
    load();
    try {
      setRecent(parseRecent(localStorage.getItem('tw_recent')));
    } catch { /* ignore */ }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deals = [...products]
    .map((p) => ({ p, d: off(p) || 0 }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 4)
    .map((x) => x.p);

  const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))].slice(0, 8);

  return (
    <div>
      <section className="bg-gradient-to-r from-orange-600 via-[#F97316] to-amber-500 text-white">
        <div className="max-w-7xl mx-auto px-4 py-14 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <span className="badge bg-white/20 text-white mb-3">GST Invoice • EMI • Pan-India Delivery</span>
            <h1 className="text-4xl md:text-5xl font-black leading-tight">India&apos;s Machinery Store</h1>
            <p className="mt-3 text-orange-50">Power tools, motors, agri equipment & welders at wholesale prices. UPI, cards, EMI & COD accepted.</p>
            <div className="mt-6 flex gap-3">
              <a href="/category/all" className="bg-white text-orange-700 font-bold px-6 py-3 rounded-lg">Shop Now</a>
              <a href="/bulk-quote" className="border border-white text-white font-bold px-6 py-3 rounded-lg">Bulk Quote</a>
            </div>
          </div>
          <div className="hidden md:block">
            <img src="https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=800&q=80" alt="Machinery" className="rounded-2xl shadow-2xl" />
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold">🔥 Deals of the Day</h2>
          <a href="/deals" className="text-[#F97316] font-bold text-sm">View all deals →</a>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {deals.map((p) => <Card key={p.slug || p.id} p={p} />)}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 mt-10">
        <h2 className="text-2xl font-extrabold">Shop by Category</h2>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {CATS.map((c) => (
            <a key={c.slug} href={`/category/${c.slug}`} className="card">
              <img src={c.img} alt={c.name} className="h-28 w-full object-cover" loading="lazy" />
              <div className="p-3 font-bold text-sm text-center">{c.name}</div>
            </a>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold">Bestsellers</h2>
          <a href="/category/all" className="text-[#F97316] font-bold text-sm">View all →</a>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {products.slice(0, 8).map((p) => <Card key={p.slug || p.id} p={p} />)}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold">Top Brands</h2>
          <a href="/brands" className="text-[#F97316] font-bold text-sm">View all brands →</a>
        </div>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {brands.map((b) => (
            <a key={b} href={`/brand/${encodeURIComponent(b)}`} className="card px-6 py-4 font-extrabold whitespace-nowrap hover:border-[#F97316]">{b}</a>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 mt-10">
          <h2 className="text-2xl font-extrabold">Recently Viewed</h2>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {recent.slice(0, 4).map((p) => <Card key={p.slug} p={p} />)}
          </div>
        </section>
      )}

      <section className="max-w-7xl mx-auto px-4 mt-10 grid sm:grid-cols-3 gap-4 text-sm">
        <div className="card p-4"><b>EMI Available</b><p className="text-gray-600 mt-1">No-cost EMI on cards from ₹2,999. 3/6/9/12 month plans at checkout.</p></div>
        <div className="card p-4"><b>UPI • Cards • COD</b><p className="text-gray-600 mt-1">Secure Razorpay payments. Cash on Delivery on eligible pincodes.</p></div>
        <div className="card p-4"><b>GST Invoice</b><p className="text-gray-600 mt-1">18% GST invoice for input tax credit on business orders.</p></div>
      </section>

      <section className="max-w-7xl mx-auto px-4 mt-10">
        <div className="rounded-2xl bg-gray-900 text-white p-8 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="flex-1">
            <h3 className="text-2xl font-extrabold">Buying for a site, farm or factory?</h3>
            <p className="text-gray-300 mt-1">Get wholesale bulk pricing on 5+ units with GST invoice & freight support.</p>
          </div>
          <a href="/bulk-quote" className="btn-primary">Request Bulk Quote</a>
        </div>
      </section>
    </div>
  );
}
