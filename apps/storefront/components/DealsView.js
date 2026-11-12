'use client';

import { useEffect, useState } from 'react';
import { fetchProducts, asList } from '../lib/api';
import { discountPct, pickDeals } from '../lib/deals';

// The countdown is intentionally client-only (it depends on the visitor's clock), and it
// renders "--:--:--" until mounted so server HTML and first paint agree.
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

export default function DealsView({ initialItems = null }) {
  const seeded = Array.isArray(initialItems);
  const [items, setItems] = useState(seeded ? initialItems : []);
  const [loading, setLoading] = useState(!seeded);
  const left = useCountdown();

  useEffect(() => {
    if (seeded) return undefined; // server already rendered the deals
    let alive = true;
    async function load() {
      try {
        const data = await fetchProducts({ limit: 100 });
        const list = pickDeals(asList(data));
        if (alive) setItems(list);
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                <img src={p.image || p.images?.[0] || '/images/placeholder.svg'} alt={p.name} className="h-40 w-full object-cover" loading="lazy" />
                <span className="badge bg-green-600 text-white absolute top-2 left-2">{p.discountPct ?? discountPct(p)}% OFF</span>
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
          ))}
        </div>
      )}
    </div>
  );
}
