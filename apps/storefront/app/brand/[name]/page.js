'use client';

import { useEffect, useState } from 'react';
import { searchProducts, asList } from '../../../lib/api';

export default function BrandPage({ params }) {
  const name = decodeURIComponent(params.name);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const data = await searchProducts({ brand: name, limit: 40 });
        if (alive) setItems(asList(data));
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [name]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <a href="/brands" className="text-sm text-[#F97316] font-bold">← All brands</a>
      <h1 className="text-3xl font-extrabold mt-1">{name}</h1>
      <p className="text-sm text-gray-500 mt-1">{items.length} products • GST invoice • EMI available</p>
      {loading ? (
        <p className="mt-8 text-gray-500">Loading products...</p>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center mt-6">
          <p className="text-gray-600">No products found for {name}.</p>
          <a href="/category/all" className="btn-primary inline-block mt-4">Browse All Products</a>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((p) => {
            const off = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
            return (
              <a key={p.slug || p.id} href={`/product/${p.slug || p.id}`} className="card">
                <div className="relative">
                  <img src={p.image || p.images?.[0] || 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&q=70'} alt={p.name} className="h-40 w-full object-cover" loading="lazy" />
                  {off > 0 && <span className="badge bg-green-600 text-white absolute top-2 left-2">{off}% OFF</span>}
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
          })}
        </div>
      )}
    </div>
  );
}
