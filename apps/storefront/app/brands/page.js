'use client';

import { useEffect, useState } from 'react';
import { fetchProducts, asList } from '../../lib/api';

export default function BrandsPage() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        // Page through the whole catalog so no brand is missed past the first 100 products.
        const map = {};
        for (let page = 0; page < 10; page++) {
          const data = await fetchProducts({ limit: 100, offset: page * 100 });
          const list = asList(data);
          if (!list.length) break;
          list.forEach((p) => {
            const b = (p.brand || '').trim();
            if (b) map[b] = (map[b] || 0) + 1;
          });
          if (list.length < 100) break;
        }
        const arr = Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
        if (alive) setBrands(arr);
      } catch {
        if (alive) setBrands([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Shop by Brand</h1>
      <p className="text-sm text-gray-500 mt-1">Genuine brands with GST invoice & warranty support.</p>
      {loading ? (
        <p className="mt-8 text-gray-500">Loading brands...</p>
      ) : brands.length === 0 ? (
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
