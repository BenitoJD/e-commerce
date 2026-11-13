'use client';

import { useEffect, useState } from 'react';
import { fetchProduct } from '../../lib/api';
import { addToCart } from '../../lib/cart';
import {
  parseCompare, removeCompare, COMPARE_KEY, COMPARE_MAX, specRows,
} from '../../lib/compare';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Side-by-side comparison of up to four products. The list lives in localStorage, so the
// page is client-rendered and noindexed — it is a working surface, not a landing page.
export default function ComparePage() {
  const [picked, setPicked] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const saved = parseCompare(localStorage.getItem(COMPARE_KEY));
    setPicked(saved);
    if (!saved.length) { setLoading(false); return undefined; }
    let alive = true;
    (async () => {
      try {
        const results = await Promise.all(saved.map((p) => fetchProduct(p.slug).catch(() => null)));
        if (!alive) return;
        const found = results.map((r) => (r && (r.product || r)) || null).filter(Boolean);
        setProducts(found);
        if (found.length !== saved.length) {
          setError('Some products in your comparison are no longer available.');
        }
      } catch (e) {
        if (alive) setError(e.message || 'Could not load the comparison.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  function drop(slug) {
    const next = removeCompare(picked, slug);
    setPicked(next);
    setProducts((prev) => prev.filter((p) => String(p.slug) !== String(slug)));
    try { localStorage.setItem(COMPARE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    window.dispatchEvent(new Event('compare-updated'));
  }

  function clearAll() {
    setPicked([]);
    setProducts([]);
    try { localStorage.removeItem(COMPARE_KEY); } catch { /* ignore */ }
    window.dispatchEvent(new Event('compare-updated'));
  }

  const rows = specRows(products);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-extrabold">Compare products</h1>
        {picked.length > 0 ? (
          <button onClick={clearAll} className="text-xs font-bold text-red-600 underline">Clear all</button>
        ) : null}
      </div>
      <p className="text-sm text-gray-500 mt-1">
        Up to {COMPARE_MAX} products side by side. {picked.length} selected.
      </p>

      {error ? <p role="alert" className="text-sm text-red-600 font-semibold mt-4">{error}</p> : null}
      {loading ? <p className="mt-6 text-gray-500">Loading comparison…</p> : null}

      {!loading && picked.length === 0 ? (
        <div className="card p-8 mt-6 text-center">
          <p className="font-bold text-lg">Nothing to compare yet</p>
          <p className="text-sm text-gray-600 mt-1">
            Press <b>Compare</b> on a product page to add it here (up to {COMPARE_MAX}).
          </p>
          <a href="/category/all" className="btn-primary inline-block mt-4">Browse products</a>
        </div>
      ) : null}

      {!loading && products.length > 0 ? (
        <div className="overflow-x-auto card mt-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-3 text-left text-gray-500 font-semibold">Attribute</th>
                {products.map((p) => (
                  <th key={p.slug} className="p-3 text-left align-top min-w-[180px]">
                    <a href={`/product/${encodeURIComponent(p.slug)}`} className="font-bold hover:text-[#F97316]">{p.name}</a>
                    <div className="text-xs text-gray-500 font-normal mt-0.5">{p.brand || ''}</div>
                    <button
                      onClick={() => drop(p.slug)}
                      className="mt-2 text-[11px] font-bold text-red-600 underline"
                      aria-label={`Remove ${p.name} from the comparison`}
                    >
                      Remove
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="p-3 text-gray-500">Price</td>
                {products.map((p) => (
                  <td key={p.slug} className="p-3 font-extrabold">{inr(p.price)}</td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-3 text-gray-500">MRP</td>
                {products.map((p) => (
                  <td key={p.slug} className="p-3 text-gray-500 line-through">{p.mrp ? inr(p.mrp) : '—'}</td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-3 text-gray-500">Availability</td>
                {products.map((p) => (
                  <td key={p.slug} className="p-3">
                    {Number(p.stock) > 0 ? <span className="text-green-700 font-semibold">In stock</span> : <span className="text-red-600 font-semibold">Out of stock</span>}
                  </td>
                ))}
              </tr>
              <tr className="border-b">
                <td className="p-3 text-gray-500">HSN</td>
                {products.map((p) => (
                  <td key={p.slug} className="p-3 font-mono text-xs">{p.hsn || '—'}</td>
                ))}
              </tr>
              {rows.map((key) => (
                <tr key={key} className="border-b last:border-0">
                  <td className="p-3 text-gray-500 capitalize">{key}</td>
                  {products.map((p) => (
                    <td key={p.slug} className="p-3">{p.specs && p.specs[key] != null ? String(p.specs[key]) : '—'}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="p-3" />
                {products.map((p) => (
                  <td key={p.slug} className="p-3">
                    <button
                      onClick={() => addToCart({ slug: p.slug, name: p.name, price: p.price, image: p.image || (p.images && p.images[0]) }, 1)}
                      disabled={!Number(p.stock)}
                      className="btn-primary !py-2 !px-3 text-xs disabled:opacity-50"
                    >
                      {Number(p.stock) ? 'Add to cart' : 'Out of stock'}
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
