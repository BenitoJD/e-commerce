'use client';

import { useEffect, useRef, useState } from 'react';
import { suggestSearch } from '../lib/api';

function inr(paise) {
  return `₹${Math.round(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
}

// Header search with typeahead. Falls back to a normal form submit (so it still works
// without JS), suggestions are an enhancement, not a requirement.
export default function SearchBox({ compact = false }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ products: [], brands: [], categories: [] });
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setData({ products: [], brands: [], categories: [] });
      setOpen(false);
      return undefined;
    }
    const id = ++seq.current;
    const t = setTimeout(() => {
      suggestSearch(term)
        .then((r) => {
          if (id !== seq.current) return; // a newer keystroke won
          const d = r || {};
          setData({
            products: Array.isArray(d.products) ? d.products : [],
            brands: Array.isArray(d.brands) ? d.brands : [],
            categories: Array.isArray(d.categories) ? d.categories : [],
          });
          setOpen(true);
          setActive(-1);
        })
        .catch(() => { if (id === seq.current) setOpen(false); });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const rows = [
    ...data.products.map((p) => ({ type: 'product', key: `p-${p.slug}`, href: `/product/${p.slug}`, label: p.name, meta: inr(p.price_paise), sub: p.brand })),
    ...data.brands.map((b) => ({ type: 'brand', key: `b-${b.brand}`, href: `/brand/${encodeURIComponent(b.brand)}`, label: b.brand, meta: `${b.count} product${b.count === 1 ? '' : 's'}` })),
    ...data.categories.map((c) => ({ type: 'category', key: `c-${c.category}`, href: `/category/${c.category}`, label: c.category.replace(/-/g, ' '), meta: `${c.count} product${c.count === 1 ? '' : 's'}` })),
  ];
  const hasAny = rows.length > 0;

  function go(href) {
    setOpen(false);
    setQ('');
    window.location.href = href;
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open && hasAny) { setOpen(true); return; }
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && rows[active]) {
        e.preventDefault();
        go(rows[active].href);
      }
      // otherwise let the form submit to /category/all?q=
    }
  }

  return (
    <div ref={boxRef} className="relative flex-1">
      <div className="flex items-center rounded-full border border-line bg-surface transition focus-within:border-copper focus-within:ring-2 focus-within:ring-copper/15">
        <span aria-hidden="true" className="pl-4 pr-2 text-muted">⌕</span>
        <input
          name="q"
          aria-label="Search products"
          aria-activedescendant={open && active >= 0 ? `suggest-opt-${active}` : undefined}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (hasAny) setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder={compact ? 'Search...' : 'Search tools, motors, furniture…'}
          className="w-full bg-transparent border-0 px-1 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-0"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-suggest"
          aria-autocomplete="list"
        />
        <button type="submit" className="m-1 rounded-full bg-ink text-paper px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition hover:bg-copper">
          {compact ? 'Go' : 'Search'}
        </button>
      </div>

      {open && (
        <div id="search-suggest" role={hasAny ? 'listbox' : 'status'} className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line rounded-2xl shadow-lift z-[60] overflow-hidden text-sm">
          {!hasAny ? (
            <div className="px-4 py-3 text-muted">
              No matches for “{q.trim()}”. Press Enter to search everything.
            </div>
          ) : rows.map((r, i) => (
            <a
              key={r.key}
              id={`suggest-opt-${i}`}
              href={r.href}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={(e) => { e.preventDefault(); go(r.href); }}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${i === active ? 'bg-copper-light' : 'hover:bg-copper-light/40'}`}
            >
              <span className="truncate">
                <span className="text-[11px] uppercase tracking-wide text-gray-400 mr-2">{r.type}</span>
                <span className="font-semibold">{r.label}</span>
                {r.sub ? <span className="text-gray-500"> · {r.sub}</span> : null}
              </span>
              <span className="text-gray-600 whitespace-nowrap">{r.meta}</span>
            </a>
          ))}
          {hasAny && (
            <button
              type="submit"
              className="w-full text-left px-4 py-3 bg-paper text-copper font-bold border-t border-line"
            >
              See all results for “{q.trim()}” →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
