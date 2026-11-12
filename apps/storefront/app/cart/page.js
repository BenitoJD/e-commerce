'use client';

import { useEffect, useState } from 'react';
import { getCart, updateQty, removeItem, cartTotal } from '../../../lib/cart';

export default function CartPage() {
  const [items, setItems] = useState([]);
  const [pincode, setPincode] = useState('');

  useEffect(() => {
    setItems(getCart());
    const sync = () => setItems(getCart());
    window.addEventListener('cart-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('cart-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const total = cartTotal(items);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Your Cart</h1>
      {items.length === 0 ? (
        <div className="card p-10 text-center mt-6">
          <p className="text-gray-600">Your cart is empty.</p>
          <a href="/category/all" className="btn-primary inline-block mt-4">Browse Products</a>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6 mt-6">
          <div className="md:col-span-2 space-y-3">
            {items.map((i) => (
              <div key={i.slug} className="card p-3 flex gap-3 items-center">
                {i.image && <img src={i.image} alt={i.name} className="w-20 h-20 object-cover rounded-lg border" />}
                <div className="flex-1">
                  <div className="font-bold text-sm">{i.name}</div>
                  <div className="text-sm text-gray-600">₹{Number(i.price).toLocaleString('en-IN')} each</div>
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => setItems(updateQty(i.slug, i.qty - 1))} className="border rounded px-2.5 py-1 font-bold">−</button>
                    <span className="font-bold">{i.qty}</span>
                    <button onClick={() => setItems(updateQty(i.slug, i.qty + 1))} className="border rounded px-2.5 py-1 font-bold">+</button>
                    <button onClick={() => setItems(removeItem(i.slug))} className="ml-2 text-xs text-red-600 font-bold">Remove</button>
                  </div>
                </div>
                <div className="font-extrabold">₹{(Number(i.price) * Number(i.qty)).toLocaleString('en-IN')}</div>
              </div>
            ))}
          </div>
          <div className="card p-5 h-fit">
            <label className="label">Delivery pincode</label>
            <div className="flex gap-2">
              <input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="e.g. 110001" className="input" />
            </div>
            {pincode.length === 6 ? (
              <p className="text-xs text-green-700 font-semibold mt-2">Delivery to {pincode} in 3–7 days.</p>
            ) : (
              <p className="text-xs text-gray-500 mt-2">Enter 6-digit pincode to check delivery.</p>
            )}
            <div className="mt-4 flex justify-between font-bold">
              <span>Subtotal</span>
              <span>₹{total.toLocaleString('en-IN')}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Shipping + GST calculated at checkout.</p>
            <a href="/checkout" className="btn-primary block text-center mt-4">Proceed to Checkout</a>
            <a href="/category/all" className="block text-center text-sm text-[#F97316] font-bold mt-3">Continue shopping</a>
          </div>
        </div>
      )}
    </div>
  );
}
