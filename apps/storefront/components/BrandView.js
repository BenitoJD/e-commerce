'use client';


import { useEffect, useState } from 'react';
import { searchProducts, asList } from '../lib/api';
import ProductCard from './ProductCard';

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
        <a href="/" className="hover:text-[#A95F32]">Home</a>
        <span className="mx-1">/</span>
        <a href="/brands" className="hover:text-[#A95F32]">Brands</a>
        <span className="mx-1">/</span>
        <span className="text-gray-700">{name}</span>
      </nav>
      <a href="/brands" className="text-sm text-[#A95F32] font-bold">← All brands</a>
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
        <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
          {items.map((p) => <ProductCard key={p.slug || p.id} p={p} />)}
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
