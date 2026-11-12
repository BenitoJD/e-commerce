'use client';

import { useEffect, useState } from 'react';
import { fetchProducts, asList } from '../../lib/api';

function discountPct(p) {
  if (!p.mrp || p.mrp <= p.price) return 0;
  return Math.round(((p.mrp - p.price) / p.mrp) * 100);
}

function useCountdown() {
  const [left, setLeft] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const mid = new Date(now);
      mid.setHours(24, 0, 0, 0);
      const ms = Math.max(0, mid - now);
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLeft(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return left;
}

export default function DealsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const left = useCountdown();

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await fetchProducts({ limit: 100 });
        const list = asList(data)
          .map((p) => ({ ...p, discountPct: discountPct(p) }))
          .filter((p) => p.discountPct >= 20)
          .sort((a, b) => b.discountPct - a.discountPct);
        if (alive) setItems(list);
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="rounded-2xl bg-gradient-to-r from-orange-600 via-[#F97316] to-amber-500 text-white p-8 flex flex-col md:flex-row items-start md:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-black">Deals of the Day 🔥</h1>
          <p className="text-orange-50 mt-1">20%+ off genuine tools. GST invoice included on every order.</p>
        </div>
        <div className="bg-white/15 rounded-xl px-5 py-3 text-center">
          <div className="text-xs font-bold uppercase tracking-wide">Ends in</div>
          <div className="text-2xl font-black tabular-nums">{left || '--:--:--'}</div>
        </div>
      </div>

      {loading ? (
        <p className="mt-8 text-gray-500">Loading deals...</p>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center mt-6">
          <p className="text-gray-600">No 20%+ deals live right now. Check bestsellers instead!</p>
          <a href="/category/all" className="btn-primary inline-block mt-4">Browse All</a>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((p) => (
            <a key={p.slug || p.id} href={`/product/${p.slug || p.id}`} className="card">
              <div className="relative">
                <img src={p.image || p.images?.[0] || 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&q=70'} alt={p.name} className="h-40 w-full object-cover" loading="lazy" />
                <span className="badge bg-green-600 text-white absolute top-2 left-2">{p.discountPct}% OFF</span>
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
          ))}
        </div>
      )}
    </div>
  );
}
