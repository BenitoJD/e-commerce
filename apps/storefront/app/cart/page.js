'use client';

import { useEffect, useState } from 'react';
import { getCart, updateQty, removeItem, cartTotal } from '../../lib/cart';
import { validateCoupon, checkPincode } from '../../lib/api';

function readCoupon() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('tw_coupon') || 'null');
  } catch {
    return null;
  }
}

export default function CartPage() {
  const [items, setItems] = useState([]);
  const [pincode, setPincode] = useState('');
  const [code, setCode] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponMsg, setCouponMsg] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [pinMsg, setPinMsg] = useState('');

  useEffect(() => {
    setItems(getCart());
    setCoupon(readCoupon());
    const sync = () => setItems(getCart());
    window.addEventListener('cart-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('cart-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!/^\d{6}$/.test(pincode)) {
      setPinMsg('');
      return undefined;
    }
    setPinMsg('Checking delivery...');
    checkPincode(pincode)
      .then((r) => {
        if (!alive) return;
        if (r && r.serviceable === false) setPinMsg('Sorry, delivery is not available to this pincode yet.');
        else if (r && r.etaDays) setPinMsg(`Delivery to ${pincode} in ~${r.etaDays} days${r.codAvailable ? ' • COD available' : ''}.`);
        else setPinMsg(`Delivery to ${pincode} in 3–7 days.`);
      })
      .catch(() => { if (alive) setPinMsg(`Delivery to ${pincode} in 3–7 days.`); });
    return () => { alive = false; };
  }, [pincode]);

  const subtotal = cartTotal(items);
  const discount = coupon ? Math.min(Number(coupon.discountPaise || 0) / 100, subtotal) : 0;
  const payable = Math.max(0, subtotal - discount);

  // A coupon saved earlier can expire, get disabled, hit its usage cap, or stop
  // qualifying after the cart shrinks. Re-validate it whenever the cart total
  // changes instead of carrying a stale discount into checkout.
  useEffect(() => {
    if (!coupon || !coupon.code || subtotal <= 0) return undefined;
    let alive = true;
    validateCoupon(coupon.code, Math.round(subtotal * 100))
      .then((r) => {
        if (!alive) return;
        if (r && r.valid === false) {
          setCoupon(null);
          try { localStorage.removeItem('tw_coupon'); } catch { /* ignore */ }
          setCouponMsg(`Coupon ${coupon.code} removed: ${r.reason || 'no longer valid'}.`);
        } else if (r && Number(r.discount_paise) !== Number(coupon.discountPaise)) {
          const fresh = { code: coupon.code, discountPaise: Number(r.discount_paise) || 0 };
          setCoupon(fresh);
          try { localStorage.setItem('tw_coupon', JSON.stringify(fresh)); } catch { /* ignore */ }
        }
      })
      .catch(() => { /* keep the stored value if the API is unreachable */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, coupon && coupon.code]);

  const applyCoupon = async () => {
    setCouponMsg('');
    if (!code.trim()) { setCouponMsg('Enter a coupon code.'); return; }
    setCouponBusy(true);
    try {
      const r = await validateCoupon(code.trim(), Math.round(subtotal * 100));
      if (r && (r.valid === false || r.discount_paise == null)) {
        const reason = r.reason || 'Invalid coupon for this order.';
        setCouponMsg(reason);
        setCoupon(null);
        localStorage.removeItem('tw_coupon');
      } else {
        const pct = r.pct_off != null ? ` (${r.pct_off}% off)` : '';
        const saved = { code: code.trim().toUpperCase(), discountPaise: Number(r.discount_paise || 0) };
        setCoupon(saved);
        localStorage.setItem('tw_coupon', JSON.stringify(saved));
        setCouponMsg(`Coupon applied${pct}! You save ₹${(saved.discountPaise / 100).toLocaleString('en-IN')}.`);
      }
    } catch (e) {
      setCouponMsg(e.message || 'Could not validate coupon.');
    } finally {
      setCouponBusy(false);
    }
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCode('');
    setCouponMsg('');
    try { localStorage.removeItem('tw_coupon'); } catch { /* ignore */ }
  };

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
            <label className="label">Coupon code</label>
            {coupon ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                <span><b>{coupon.code}</b> <span className="text-green-700 font-semibold">−₹{discount.toLocaleString('en-IN')}</span></span>
                <button onClick={removeCoupon} className="text-xs text-red-600 font-bold">Remove</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. DIWALI10" className="input uppercase" />
                <button onClick={applyCoupon} disabled={couponBusy} className="btn-outline !px-4 whitespace-nowrap disabled:opacity-60">Apply</button>
              </div>
            )}
            {couponMsg && <p className={`text-xs font-semibold mt-2 ${coupon ? 'text-green-700' : 'text-gray-600'}`}>{couponMsg}</p>}
            <div className="border-t mt-4 pt-4">
              <label className="label">Delivery pincode</label>
              <div className="flex gap-2">
                <input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="e.g. 110001" className="input" />
              </div>
              {pincode.length === 6 ? (
                <p className="text-xs text-green-700 font-semibold mt-2">{pinMsg || `Delivery to ${pincode} in 3–7 days.`}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-2">Enter 6-digit pincode to check delivery.</p>
              )}
            </div>
            <div className="mt-4 space-y-1 font-bold">
              <div className="flex justify-between text-sm text-gray-600"><span>Subtotal</span><span>₹{subtotal.toLocaleString('en-IN')}</span></div>
              {discount > 0 && <div className="flex justify-between text-sm text-green-700"><span>Coupon ({coupon.code})</span><span>−₹{discount.toLocaleString('en-IN')}</span></div>}
              <div className="flex justify-between text-lg"><span>To Pay</span><span>₹{payable.toLocaleString('en-IN')}</span></div>
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
