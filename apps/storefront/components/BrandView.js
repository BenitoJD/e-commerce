'use client';

import { useEffect, useState } from 'react';
import { searchProducts, asList } from '../lib/api';

export default function BrandView({ name, initialItems = [], initialTotal = null }) {
  const PAGE = 40;
  const [items, setItems] = useState(Array.isArray(initialItems) ? initialItems : []);
  const [loading, setLoading] = useState(!(Array.isArray(initialItems) && initialItems.length));
  const [loadingMore, setLoadingMore] = useState(false);
  // Server sends exactly PAGE items when more may exist, so this comparison is meaningful.
  const [hasMore, setHasMore] = useState((initialItems || []).length === PAGE);
  const [total, setTotal] = useState(Number.isFinite(Number(initialTotal)) ? Number(initialTotal) : null);

  useEffect(() => {
    // Server rendered the first page already; only paginate from here.
    if (initialItems && initialItems.length) {
      setLoading(false);
      return undefined;
    }
    let alive = true;
    async function load() {
      setLoading(true);
      setHasMore(false);
      try {
        const data = await searchProducts({ brand: name, limit: PAGE, offset: 0 });
        const list = asList(data);
        if (!alive) return;
        setItems(list);
        setHasMore(list.length === PAGE);
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await searchProducts({ brand: name, limit: PAGE, offset: items.length });
      const list = asList(data);
      setItems((prev) => [...prev, ...list]);
      setHasMore(list.length === PAGE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-2">
        <a href="/" className="hover:text-[#F97316]">Home</a>
        <span className="mx-1">/</span>
        <a href="/brands" className="hover:text-[#F97316]">Brands</a>
        <span className="mx-1">/</span>
        <span className="text-gray-700">{name}</span>
      </nav>
      <a href="/brands" className="text-sm text-[#F97316] font-bold">← All brands</a>
      <h1 className="text-3xl font-extrabold mt-1">{name}</h1>
      <p className="text-sm text-gray-500 mt-1">
        {(total != null ? total : items.length)} product{(total != null ? total : items.length) === 1 ? '' : 's'} • GST invoice • EMI available
      </p>
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
                  <img src={p.image || p.images?.[0] || '/images/placeholder.svg'} alt={p.name} className="h-40 w-full object-cover" loading="lazy" />
                  {off > 0 && <span className="badge bg-green-600 text-white absolute top-2 left-2">{off}% OFF</span>}
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
          })}
        </div>
      )}
      {!loading && hasMore ? (
        <div className="mt-8 text-center">
          <button onClick={loadMore} disabled={loadingMore} className="btn-outline disabled:opacity-60">
            {loadingMore ? 'Loading...' : 'Load more products'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
