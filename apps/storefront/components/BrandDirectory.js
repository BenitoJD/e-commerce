'use client';

import { useMemo, useState } from 'react';
import { fitClass, isProductShot } from '../lib/image';

const LETTERS = ['All', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

function BrandImage({ brand, large = false }) {
  if (!brand.image) {
    return (
      <div className={`mx-auto ${large ? 'h-20 w-20 text-3xl' : 'h-14 w-14 text-2xl'} rounded-2xl bg-gradient-to-br from-orange-100 to-amber-100 text-[#874822] grid place-items-center font-black`}>
        {brand.name[0]}
      </div>
    );
  }
  return (
    <img
      src={brand.image}
      alt={`${brand.name} product`}
      loading="lazy"
      className={isProductShot(brand.image)
        ? fitClass(brand.image, `w-full ${large ? 'h-28' : 'h-20'} object-cover`)
        : `w-full ${large ? 'h-28' : 'h-20'} object-cover`}
    />
  );
}

function BrandCard({ brand, large = false }) {
  return (
    <a
      href={`/brand/${encodeURIComponent(brand.name)}`}
      className={`card group overflow-hidden hover:border-[#A95F32] hover:shadow-md transition ${large ? 'ring-1 ring-orange-100' : ''}`}
    >
      <div className={`bg-white border-b border-gray-100 flex items-center justify-center overflow-hidden ${large ? 'h-36 p-4' : 'h-28 p-3'}`}>
        <BrandImage brand={brand} large={large} />
      </div>
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className={`font-extrabold truncate ${large ? 'text-base' : 'text-sm'}`}>{brand.name}</div>
          <div className="text-xs text-gray-500">
            {brand.count} product{brand.count === 1 ? '' : 's'}
          </div>
        </div>
        <span aria-hidden="true" className="text-[#A95F32] font-bold shrink-0 group-hover:translate-x-0.5 transition">→</span>
      </div>
    </a>
  );
}

export default function BrandDirectory({ brands = [] }) {
  const [query, setQuery] = useState('');
  const [letter, setLetter] = useState('All');
  const [sort, setSort] = useState('name');

  const totalProducts = brands.reduce((n, b) => n + (Number(b.count) || 0), 0);
  const featured = useMemo(
    () => [...brands].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 4),
    [brands]
  );
  const availableLetters = useMemo(
    () => new Set(brands.map((b) => b.name[0].toUpperCase())),
    [brands]
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return brands
      .filter((b) => (letter === 'All' || b.name[0].toUpperCase() === letter))
      .filter((b) => !q || b.name.toLowerCase().includes(q))
      .sort((a, b) => (sort === 'products' ? b.count - a.count || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)));
  }, [brands, query, letter, sort]);

  const showFeatured = !query.trim() && letter === 'All';

  return (
    <div>
      <section className="rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50 via-amber-50 to-white px-6 py-8 md:px-10 md:py-10">
        <div className="grid lg:grid-cols-[1fr_auto] gap-8 items-end">
          <div>
            <span className="badge bg-white text-[#874822] border border-orange-200">Genuine brands</span>
            <h1 className="text-3xl md:text-4xl font-black mt-3">Shop by Brand</h1>
            <p className="text-sm md:text-base text-gray-600 mt-2 max-w-2xl">
              {brands.length} authorised brands across machinery, tools and handcrafted furniture.
              GST invoice, manufacturer warranty and pan-India delivery on every order.
            </p>
            <div className="mt-5 relative max-w-md">
              <label htmlFor="brand-search" className="sr-only">Search brands</label>
              <input
                id="brand-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a brand, e.g. Bosch or Gracewood…"
                className="input pr-10 bg-white"
                aria-label="Search brands"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true">⌕</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-white/80 border border-orange-100 px-4 py-3">
              <div className="text-2xl font-black text-[#874822]">{brands.length}</div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Brands</div>
            </div>
            <div className="rounded-2xl bg-white/80 border border-orange-100 px-4 py-3">
              <div className="text-2xl font-black text-[#874822]">{totalProducts}</div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Products</div>
            </div>
            <div className="rounded-2xl bg-white/80 border border-orange-100 px-4 py-3">
              <div className="text-2xl font-black text-[#874822]">GST</div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Invoices</div>
            </div>
          </div>
        </div>
      </section>

      {showFeatured ? (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold">Featured brands</h2>
            <span className="text-xs text-gray-500">Most stocked this season</span>
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
            {featured.map((b) => <BrandCard key={b.name} brand={b} large />)}
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold">{showFeatured ? 'All brands' : 'Matching brands'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{visible.length} of {brands.length} brands</p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="brand-sort" className="text-xs font-bold text-gray-600">Sort</label>
            <select id="brand-sort" value={sort} onChange={(e) => setSort(e.target.value)} className="input !w-auto !py-2 text-sm" aria-label="Sort brands">
              <option value="name">A–Z</option>
              <option value="products">Most products</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter brands by first letter">
          {LETTERS.map((l) => {
            const disabled = l !== 'All' && !availableLetters.has(l);
            return (
              <button
                key={l}
                type="button"
                disabled={disabled}
                aria-pressed={letter === l}
                onClick={() => setLetter(l)}
                className={`shrink-0 w-8 h-8 rounded-lg text-xs font-bold border ${letter === l ? 'bg-[#A95F32] text-white border-[#A95F32]' : disabled ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed' : 'bg-white text-gray-600 border-gray-200 hover:border-[#A95F32] hover:text-[#874822]'}`}
              >
                {l}
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div className="card p-10 text-center mt-5">
            <p className="font-bold text-lg">No brands match “{query || letter}”</p>
            <p className="text-sm text-gray-600 mt-1">Try a different spelling or browse every brand.</p>
            <button type="button" onClick={() => { setQuery(''); setLetter('All'); }} className="btn-primary mt-4">Show all brands</button>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {visible.map((b) => <BrandCard key={b.name} brand={b} />)}
          </div>
        )}
      </section>
    </div>
  );
}
