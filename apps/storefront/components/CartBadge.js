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
  return (
    <a
      href="/cart"
      className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-copper"
      aria-label={`Cart${count ? `, ${count} item${count === 1 ? '' : 's'}` : ''}`}
    >
      Cart
      {count > 0 ? <span className="rounded-full bg-copper px-2 py-0.5 text-[10px] leading-none text-white">{count}</span> : null}
    </a>
  );
}
