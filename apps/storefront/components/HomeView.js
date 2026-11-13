'use client';

import { fitClass } from '../lib/image';

import { useEffect, useState } from 'react';
import { fetchProducts, asList } from '../lib/api';
import { parseRecent } from '../lib/recent';

const FALLBACK = [
  { slug: 'bosch-gws-600-grinder', name: 'Bosch GWS 600 670W Angle Grinder', price: 3499, mrp: 4295, brand: 'Bosch', category: 'power-tools', image: '/images/products/bosch-gws-600-grinder.jpg' },
  { slug: 'makita-9553nb-grinder', name: 'Makita 9553NB 100mm Angle Grinder', price: 6899, mrp: 8250, brand: 'Makita', category: 'power-tools', image: '/images/products/makita-9553nb-grinder.jpg' },
  { slug: 'crompton-5hp-motor', name: 'Crompton 5HP 3-Phase Motor', price: 24999, mrp: 28999, brand: 'Crompton', category: 'motors', image: '/images/products/crompton-5hp-motor.jpg' },
  { slug: 'kirloskar-1hp-water-pump', name: 'Kirloskar 1HP Monoblock Pump', price: 9499, mrp: 11299, brand: 'Kirloskar', category: 'pumps', image: '/images/products/kirloskar-1hp-water-pump.jpg' },
  { slug: 'neptune-battery-sprayer', name: 'Neptune 16L Battery Sprayer', price: 3299, mrp: 4200, brand: 'Neptune', category: 'agriculture', image: '/images/products/neptune-battery-sprayer.jpg' },
  { slug: 'ibell-arc-250-welding', name: 'iBELL ARC 250 Inverter Welder', price: 8999, mrp: 12999, brand: 'iBELL', category: 'welding', image: '/images/products/ibell-arc-250-welding.jpg' },
  { slug: 'karcher-hd5-pressure-washer', name: 'Karcher HD 5/11 Pressure Washer', price: 27999, mrp: 32000, brand: 'Karcher', category: 'cleaning', image: '/images/products/karcher-hd5-pressure-washer.jpg' },
  { slug: 'bosch-gsh-11-vc-breaker', name: 'Bosch GSH 11 VC Demolition Hammer', price: 89999, mrp: 98500, brand: 'Bosch', category: 'power-tools', image: '/images/products/bosch-gsh-11-vc-breaker.jpg' }
];

const CATS = [
  { slug: 'power-tools', name: 'Power Tools', img: '/images/products/bosch-gws-600-grinder.jpg' },
  { slug: 'motors', name: 'Motors', img: '/images/products/crompton-5hp-motor.jpg' },
  { slug: 'agriculture', name: 'Agriculture', img: '/images/products/neptune-battery-sprayer.jpg' },
  { slug: 'welding', name: 'Welding', img: '/images/products/ibell-arc-250-welding.jpg' },
  { slug: 'cleaning', name: 'Cleaning', img: '/images/products/karcher-hd5-pressure-washer.jpg' },
  { slug: 'furniture', name: 'Furniture', img: '/images/gracewood-carved-door.jpg' }
];

function off(p) {
  if (!p.mrp || p.mrp <= p.price) return null;
  return Math.round(((p.mrp - p.price) / p.mrp) * 100);
}

function Card({ p }) {
  return (
    <a href={`/product/${p.slug || p.id}`} className="card">
      <div className="relative">
        <img src={p.image || p.images?.[0] || '/images/placeholder.svg'} alt={p.name} className={fitClass(p.image || p.images?.[0], 'h-40 w-full object-cover')} loading="lazy" />
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
            <h1 className="text-4xl md:text-5xl font-black leading-tight">Machinery, Tools &amp; Handcrafted Furniture</h1>
            <p className="mt-3 text-orange-50">Power tools, motors, agri equipment, welders and solid-teak furniture at honest prices. UPI, cards, EMI & COD accepted.</p>
            <div className="mt-6 flex gap-3">
              <a href="/category/all" className="bg-white text-orange-700 font-bold px-6 py-3 rounded-lg">Shop Now</a>
              <a href="/bulk-quote" className="border border-white text-white font-bold px-6 py-3 rounded-lg">Bulk Quote</a>
            </div>
          </div>
          <div className="hidden md:block">
            <img src="/images/gracewood-teak-sofa.jpg" alt="Handcrafted teak sofa set" className="rounded-2xl shadow-2xl w-full h-80 object-cover" />
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
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {CATS.map((c) => (
            <a key={c.slug} href={`/category/${c.slug}`} className="card">
              <img src={c.img} alt={c.name} className={fitClass(c.img, 'h-28 w-full object-cover')} loading="lazy" />
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
