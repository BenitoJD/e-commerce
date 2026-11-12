'use client';

import { useEffect, useState } from 'react';
import { getWishlist, removeFromWishlist, clearWishlist } from '../../lib/wishlist';
import { addToCart } from '../../lib/cart';
import { fetchStock } from '../../lib/api';

export default function WishlistPage() {
  const [items, setItems] = useState([]);
  // Saved stock can be days old; refresh it so "Out of stock" is trustworthy.
  const [stockMap, setStockMap] = useState(null);

  useEffect(() => {
    setItems(getWishlist());
    const sync = () => setItems(getWishlist());
    window.addEventListener('wishlist-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('wishlist-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    const slugs = items.map((i) => i.slug).filter(Boolean);
    if (!slugs.length) { setStockMap(null); return undefined; }
    let alive = true;
    fetchStock(slugs)
      .then((r) => { if (alive) setStockMap((r && r.stock) || {}); })
      .catch(() => { if (alive) setStockMap(null); }); // API down: fall back to saved stock
    return () => { alive = false; };
  }, [items.map((i) => i.slug).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live availability when known, otherwise the value captured when it was saved.
  const stockOf = (i) => {
    const live = stockMap && stockMap[i.slug];
    if (live && typeof live.stock === 'number') return live.stock;
    return i.stock == null ? null : Number(i.stock);
  };

  const moveToCart = (i) => {
    if (stockOf(i) === 0) return; // never add something the server will reject
    addToCart({ slug: i.slug, name: i.name, price: i.price, image: i.image }, 1);
    setItems(removeFromWishlist(i.slug));
  };

  // Bulk move: only currently-available items go to the cart, so we never add
  // something the server will reject at checkout.
  const moveAllToCart = () => {
    const movable = items.filter((i) => stockOf(i) === null || stockOf(i) > 0);
    if (!movable.length) return;
    let remaining = items;
    for (const i of movable) {
      addToCart({ slug: i.slug, name: i.name, price: i.price, image: i.image }, 1);
      remaining = removeFromWishlist(i.slug);
    }
    setItems(remaining);
    window.location.href = '/cart';
  };

  const outOfStockCount = items.filter((i) => stockOf(i) === 0).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-3xl font-extrabold">Your Wishlist ❤</h1>
        {items.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={moveAllToCart}
              disabled={items.length === outOfStockCount}
              className="btn-primary !py-1.5 !px-3 text-xs disabled:opacity-50"
            >
              Move all to cart{outOfStockCount ? ` (${items.length - outOfStockCount})` : ''}
            </button>
            <button onClick={() => setItems(clearWishlist() || [])} className="text-xs text-red-600 font-bold">Clear all</button>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <div className="card p-10 text-center mt-6">
          <p className="text-gray-600">Your wishlist is empty. Tap ♡ on any product to save it here.</p>
          <a href="/category/all" className="btn-primary inline-block mt-4">Browse Products</a>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
          {items.map((i) => {
            const stock = stockOf(i);
            const soldOut = stock === 0;
            return (
            <div key={i.slug} className="card">
              <a href={`/product/${i.slug}`}>
                {i.image && <img src={i.image} alt={i.name} className="h-40 w-full object-cover" loading="lazy" />}
              </a>
              <div className="p-3">
                <div className="text-xs text-gray-500 font-semibold">{i.brand || ''}</div>
                <a href={`/product/${i.slug}`} className="text-sm font-bold line-clamp-2 min-h-[2.5rem]">{i.name}</a>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-extrabold">₹{Number(i.price).toLocaleString('en-IN')}</span>
                  {soldOut ? (
                    <span className="badge bg-red-100 text-red-700 text-[11px]">Out of stock</span>
                  ) : (stock != null && stock <= 5 ? (
                    <span className="badge bg-amber-50 text-amber-700 border-amber-200 text-[11px]">Only {stock} left</span>
                  ) : null)}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => moveToCart(i)}
                    disabled={soldOut}
                    className="btn-primary !px-3 !py-2 text-sm flex-1 disabled:opacity-50"
                  >
                    {soldOut ? 'Out of stock' : 'Move to Cart'}
                  </button>
                  <button onClick={() => setItems(removeFromWishlist(i.slug))} className="btn-outline !px-3 !py-2 text-sm">Remove</button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
