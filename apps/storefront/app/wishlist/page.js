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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold">Your Wishlist ❤</h1>
        {items.length > 0 && (
          <button onClick={() => setItems(clearWishlist() || [])} className="text-xs text-red-600 font-bold">Clear all</button>
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
                <div className="mt-1 font-extrabold">₹{Number(i.price).toLocaleString('en-IN')}</div>
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
