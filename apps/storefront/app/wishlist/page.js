'use client';

import { useEffect, useState } from 'react';
import { getWishlist, removeFromWishlist, clearWishlist } from '../../lib/wishlist';
import { addToCart } from '../../lib/cart';

export default function WishlistPage() {
  const [items, setItems] = useState([]);

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

  const moveToCart = (i) => {
    addToCart({ slug: i.slug, name: i.name, price: i.price, image: i.image }, 1);
    setItems(removeFromWishlist(i.slug));
  };

  // Bulk move: only in-stock items go to the cart, so we never add something
  // the server will reject at checkout.
  const moveAllToCart = () => {
    const movable = items.filter((i) => i.stock == null || Number(i.stock) > 0);
    if (!movable.length) return;
    let remaining = items;
    for (const i of movable) {
      addToCart({ slug: i.slug, name: i.name, price: i.price, image: i.image }, 1);
      remaining = removeFromWishlist(i.slug);
    }
    setItems(remaining);
    window.location.href = '/cart';
  };

  const outOfStockCount = items.filter((i) => i.stock != null && Number(i.stock) <= 0).length;

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
          {items.map((i) => (
            <div key={i.slug} className="card">
              <a href={`/product/${i.slug}`}>
                {i.image && <img src={i.image} alt={i.name} className="h-40 w-full object-cover" loading="lazy" />}
              </a>
              <div className="p-3">
                <div className="text-xs text-gray-500 font-semibold">{i.brand || ''}</div>
                <a href={`/product/${i.slug}`} className="text-sm font-bold line-clamp-2 min-h-[2.5rem]">{i.name}</a>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-extrabold">₹{Number(i.price).toLocaleString('en-IN')}</span>
                  {i.stock === 0 ? (
                    <span className="badge bg-red-100 text-red-700 text-[11px]">Out of stock</span>
                  ) : (i.stock != null && i.stock <= 5 ? (
                    <span className="badge bg-amber-50 text-amber-700 border-amber-200 text-[11px]">Only {i.stock} left</span>
                  ) : null)}
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => moveToCart(i)} className="btn-primary !px-3 !py-2 text-sm flex-1">Move to Cart</button>
                  <button onClick={() => setItems(removeFromWishlist(i.slug))} className="btn-outline !px-3 !py-2 text-sm">Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
