'use client';

import { useEffect, useState } from 'react';
import { getCart } from '../lib/cart';

// Header cart link with a live unit count. The header is a server component, so the count
// lives in this tiny client island and updates on the cart-updated event.
export default function CartBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const sync = () => setCount(getCart().reduce((n, i) => n + (Number(i.qty) || 0), 0));
    sync();
    window.addEventListener('cart-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('cart-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return <a href="/cart" className="btn-primary !py-2" aria-label={`Cart${count ? `, ${count} item${count === 1 ? '' : 's'}` : ''}`}>Cart{count > 0 ? ` (${count})` : ''}</a>;
}
