'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchProducts, fetchBrands } from '../lib/api';
import { STORE } from '../lib/store';

const FALLBACK = [];

const PAGE_SIZE = 40;

export default function CategoryView({ slug, sub = '', initialItems = [], initialQ = '', initialTotal = null, parents = [] }) {
  // The API takes the two-level path; a parent-only page keeps its single-segment slug.
  const categoryPath = sub ? `${slug}/${sub}` : slug;
  const parentNode = (Array.isArray(parents) ? parents : []).find((c) => c.slug === slug) || null;
  const childNode = parentNode && sub ? (parentNode.children || []).find((k) => k.slug === sub) || null : null;
  const [items, setItems] = useState(Array.isArray(initialItems) ? initialItems : []);
  const [loading, setLoading] = useState(!(Array.isArray(initialItems) && initialItems.length));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState((initialItems || []).length === PAGE_SIZE);
  // True match count from the API (the loaded page can be shorter than the total).
  const [total, setTotal] = useState(Number.isFinite(Number(initialTotal)) ? Number(initialTotal) : null);
  const [loadError, setLoadError] = useState(false);
  const [brand, setBrand] = useState('All');
  const [sort, setSort] = useState('pop');
  const [q, setQ] = useState(initialQ);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');

  const filtersActive = brand !== 'All' || q.trim() !== '' || sort !== 'pop' || priceMin !== '' || priceMax !== '';
  const hasQuery = String(initialQ || '').trim() !== '' || q.trim() !== '';

  // Filters that differ from what the server already rendered for this URL.
  const filtersDirty =
    brand !== 'All' || sort !== 'pop' || priceMin !== '' || priceMax !== '' || q.trim() !== String(initialQ || '').trim();

  useEffect(() => {
    let alive = true;
    // Server rendered exactly these filters (including ?q=), so don't refetch on mount.
    if (!filtersDirty && initialItems && initialItems.length) {
      setLoading(false);
      return () => { alive = false; };
    }
    async function load() {
      setLoading(true);
      setHasMore(false);
      try {
        // Filters are applied by the API now, so results stay correct past the first
        // page instead of filtering a truncated slice client-side.
        const data = await fetchProducts({
          category: categoryPath,
          limit: PAGE_SIZE,
          offset: 0,
          search: q.trim() || initialQ,
          brand,
          sort,
          minPrice: priceMin,
          maxPrice: priceMax,
        });
        const list = Array.isArray(data) ? data : data.products || data.items || [];
        if (!alive) return;
        setItems(list);
        setLoadError(false);
        setHasMore(list.length === PAGE_SIZE);
        if (!Array.isArray(data) && data && Number.isFinite(Number(data.total))) setTotal(Number(data.total));
      } catch {
        if (alive) {
          // Never invent a catalogue when the API is down: fake products would 404 and
          // prices would be wrong. Say the truth and offer a retry.
          setItems([]);
          setLoadError(true);
          setHasMore(false);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    // Typing in the filter box must not fire one request per keystroke.
    const timer = setTimeout(load, 250);
    return () => { alive = false; clearTimeout(timer); };
    // Any filter change re-queries the API (server-side filtering + paging).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, initialQ, brand, sort, q, priceMin, priceMax]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchProducts({
        category: categoryPath,
        limit: PAGE_SIZE,
        offset: items.length,
        search: q.trim() || initialQ,
        brand,
        sort,
        minPrice: priceMin,
        maxPrice: priceMax,
      });
      const list = Array.isArray(data) ? data : data.products || data.items || [];
      setItems((prev) => [...prev, ...list]);
      setHasMore(list.length === PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  // Brand options come from the catalogue itself, not from the filtered results — otherwise
  // choosing one brand would remove every other option from the dropdown.
  const [brandOptions, setBrandOptions] = useState([]);
  useEffect(() => {
    let alive = true;
    fetchBrands()
      .then((r) => {
        if (!alive) return;
        const rows = Array.isArray(r) ? r : (r && r.brands) || [];
        setBrandOptions(rows.map((b) => b.name).filter(Boolean));
      })
      .catch(() => { /* dropdown falls back to what we have */ });
    return () => { alive = false; };
  }, []);

  const brands = useMemo(() => {
    const fromItems = items.map((p) => p.brand).filter(Boolean);
    return ['All', ...new Set([...brandOptions, ...fromItems])];
  }, [items, brandOptions]);

  // The API already applied brand/text/price/sort, so render its rows as-is.
  const filtered = items;

  const clearFilters = () => {
    // On a search results URL, server-rendered `initialItems` are the (possibly empty)
    // matches. Restoring them is not "clearing" anything — go back to the full catalogue.
    if (String(initialQ || '').trim()) {
      window.location.href = '/category/all';
      return;
    }
    setBrand('All');
    setSort('pop');
    setQ('');
    setPriceMin('');
    setPriceMax('');
    // Restore exactly what the server rendered for this URL. Without this the effect's
    // "already server-rendered" early-return left the previous filtered rows on screen
    // (and a zero-result filter became permanently empty).
    setItems(Array.isArray(initialItems) ? initialItems : []);
    setTotal(Number.isFinite(Number(initialTotal)) ? Number(initialTotal) : (initialItems || []).length);
    setHasMore((initialItems || []).length === PAGE_SIZE);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-2">
        <a href="/" className="hover:text-[#F97316]">Home</a>
        <span className="mx-1">/</span>
        {initialQ ? (
          <>
            <a href="/category/all" className="hover:text-[#F97316]">Search</a>
            <span className="mx-1">/</span>
            <span className="text-gray-700">&ldquo;{initialQ}&rdquo;</span>
          </>
        ) : sub ? (
          <>
            <a href={`/category/${encodeURIComponent(slug)}`} className="hover:text-[#F97316]">
              {(parentNode && parentNode.label) || slug.replace(/-/g, ' ')}
            </a>
            <span className="mx-1">/</span>
            <span className="text-gray-700">{(childNode && childNode.label) || sub.replace(/-/g, ' ')}</span>
          </>
        ) : (
          <span className="text-gray-700 capitalize">{slug === 'all' ? 'All products' : (parentNode && parentNode.label) || slug.replace(/-/g, ' ')}</span>
        )}
      </nav>
      <h1 className="text-3xl font-extrabold capitalize">
        {initialQ
          ? <>Results for &ldquo;{initialQ}&rdquo;</>
          : (childNode ? childNode.label : (parentNode && parentNode.label) || slug.replace(/-/g, ' '))}
      </h1>
      <p className="text-sm text-gray-500 mt-1">
        {(total != null ? total : filtered.length)} product{(total != null ? total : filtered.length) === 1 ? '' : 's'} • GST invoice • EMI available
      </p>

      {/* Child categories: the second level of the taxonomy, always visible so a parent page
          can be narrowed without going back to the menu. */}
      {parentNode && parentNode.children && parentNode.children.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`/category/${encodeURIComponent(slug)}`}
            aria-current={sub ? undefined : 'page'}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border ${sub ? 'border-gray-300 text-gray-600 hover:border-[#F97316]' : 'border-[#F97316] text-[#F97316]'}`}
          >
            All {parentNode.label}
          </a>
          {parentNode.children.map((k) => (
            <a
              key={k.slug}
              href={`/category/${encodeURIComponent(slug)}/${encodeURIComponent(k.slug)}`}
              aria-current={sub === k.slug ? 'page' : undefined}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border ${sub === k.slug ? 'border-[#F97316] text-[#F97316]' : 'border-gray-300 text-gray-600 hover:border-[#F97316]'}`}
            >
              {k.label}{k.count ? <span className="text-gray-400 font-normal"> ({k.count})</span> : null}
            </a>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter in this category..." className="input max-w-xs" aria-label="Filter products in this category" />
        <select value={brand} onChange={(e) => setBrand(e.target.value)} className="input max-w-[180px]" aria-label="Filter by brand">
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="input max-w-[200px]" aria-label="Sort products">
          <option value="pop">Sort: Newest first</option>
          <option value="low">Price: Low to High</option>
          <option value="high">Price: High to Low</option>
          <option value="off">Discount</option>
        </select>
        <div className="flex items-center gap-1">
          <input value={priceMin} onChange={(e) => setPriceMin(e.target.value.replace(/[^\d]/g, ''))} placeholder="Min ₹" inputMode="numeric" className="input max-w-[100px]" aria-label="Minimum price in rupees" />
          <span className="text-gray-400">–</span>
          <input value={priceMax} onChange={(e) => setPriceMax(e.target.value.replace(/[^\d]/g, ''))} placeholder="Max ₹" inputMode="numeric" className="input max-w-[100px]" aria-label="Maximum price in rupees" />
        </div>
        {(brand !== 'All' || sort !== 'pop' || q.trim() !== '' || priceMin !== '' || priceMax !== '') && (
          <button onClick={clearFilters} className="text-xs font-bold text-[#F97316] underline">Clear filters</button>
        )}
      </div>

      {loading ? (
        <p className="mt-8 text-gray-500">Loading products...</p>
      ) : loadError ? (
        <div className="card p-8 mt-8 text-center">
          <p className="font-bold text-lg">We couldn&apos;t load products right now</p>
          <p className="text-sm text-gray-600 mt-1">The catalogue is temporarily unavailable. Please retry, or contact us on WhatsApp.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button onClick={() => setLoadError(false)} className="btn-primary" type="button">Retry</button>
            <a href="/contact-us" className="btn-outline">Contact us</a>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 mt-8 text-center">
          <p className="font-bold text-lg">
            {initialQ ? <>No products match &ldquo;{initialQ}&rdquo;</> : 'No products match these filters'}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            Try a shorter search, or browse a category below. We stock 30+ tools across seven categories.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <a href="/category/all" className="btn-primary">Browse all products</a>
            <button onClick={clearFilters} className="btn-outline">Clear filters</button>
            <a href={`https://wa.me/${STORE.phoneDigits}?text=${encodeURIComponent(`Hi, do you have "${initialQ || 'this item'}" in stock?`)}`}
               target="_blank" rel="noreferrer" className="btn-outline !text-green-700">
              Ask on WhatsApp
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {filtered.map((p) => {
            const off = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
            return (
              <a key={p.slug || p.id} href={`/product/${p.slug || p.id}`} className={`card ${p.stock === 0 ? 'opacity-90' : ''}`}>
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
