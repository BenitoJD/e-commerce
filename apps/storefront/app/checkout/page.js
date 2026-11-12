'use client';

import { useEffect, useState } from 'react';
import { getCart, cartTotal, clearCart } from '../../lib/cart';
import { gstInclusiveSplit } from '../../lib/pricing';
import { createCheckout, validateCoupon } from '../../lib/api';
import { COD_MAX_RUPEES, SHIPPING_FEE_RUPEES, shippingFor } from '../../lib/store';

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('No window'));
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.body.appendChild(s);
  });
}

function readCoupon() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('tw_coupon') || 'null');
  } catch {
    return null;
  }
}

export default function CheckoutPage() {
  const [items, setItems] = useState([]);
  const [coupon, setCoupon] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', pincode: '', gstin: '', payMode: 'UPI' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [serverTotal, setServerTotal] = useState(null); // authoritative total returned by backend

  useEffect(() => {
    setItems(getCart());
    setCoupon(readCoupon());
  }, []);

  const subtotal = cartTotal(items);
  const discount = coupon ? Math.min(Number(coupon.discountPaise || 0) / 100, subtotal) : 0;
  const shipping = shippingFor(Math.max(0, subtotal - discount));
  const total = Math.max(0, subtotal - discount) + shipping;
  // Server is authoritative: if backend repriced (stale cart prices), show its total.
  const shown = serverTotal != null ? serverTotal : total;

  // Last line of defence: never let a stale coupon reach the payment step.
  // Re-validate once the cart is known and drop it with a visible notice.
  const [couponNotice, setCouponNotice] = useState('');
  useEffect(() => {
    if (!coupon || !coupon.code || subtotal <= 0) return undefined;
    let alive = true;
    validateCoupon(coupon.code, Math.round(subtotal * 100))
      .then((r) => {
        if (!alive) return;
        if (r && r.valid === false) {
          setCoupon(null);
          try { localStorage.removeItem('tw_coupon'); } catch { /* ignore */ }
          setCouponNotice(`Coupon ${coupon.code} is no longer valid (${r.reason || 'expired or used up'}) — it was removed.`);
        }
      })
      .catch(() => { /* network blip: let the server decide at order creation */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, coupon && coupon.code]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // If the basket grows past the COD cap (quantity change, coupon removed), don't leave
  // the buyer on an option the server will reject.
  useEffect(() => {
    if (shown > COD_MAX_RUPEES && form.payMode === 'COD') {
      setForm((f) => ({ ...f, payMode: 'UPI' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const clearCoupon = () => {
    try { localStorage.removeItem('tw_coupon'); } catch { /* ignore */ }
  };

  async function placeOrder(e) {
    e.preventDefault();
    setErr('');
    setServerTotal(null);
    if (!items.length) { setErr('Cart is empty.'); return; }
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim() || !form.pincode.trim()) {
      setErr('Please fill name, phone, address and pincode.');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(form.phone.replace(/\D/g, ''))) { setErr('Enter a valid 10-digit mobile number.'); return; }
    if (!/^\d{6}$/.test(form.pincode)) { setErr('Enter a valid 6-digit pincode.'); return; }

    setBusy(true);
    try {
      const payload = {
        customer: { name: form.name, phone: form.phone, address: form.address, pincode: form.pincode, gstin: form.gstin.trim() || null },
        items: items.map((i) => ({ slug: i.slug, qty: i.qty, price: i.price })),
        payMode: form.payMode,
        amount: total,
        subtotal,
        couponCode: coupon ? coupon.code : undefined,
        discount: discount || 0
      };
      const res = await createCheckout(payload);
      const receipt = res.receipt || res.receiptId || res.orderId || Date.now().toString();
      const razorpayOrderId = res.razorpayOrderId || res.razorpay_order_id || res.order_id;
      try { if (typeof window !== 'undefined') window.localStorage.setItem('tw_phone', form.phone.trim()); } catch { /* ignore */ }

      if (form.payMode === 'COD' || !razorpayOrderId) {
        clearCart();
        clearCoupon();
        window.location.href = `/order-success?receipt=${encodeURIComponent(receipt)}&mode=COD`;
        return;
      }

      await loadRazorpay();
      const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      // Server is authoritative on the chargeable amount (applies coupon server-side)
      const serverPaise = Number(res.amount_paise) || 0;
      const chargePaise = serverPaise > 0 ? serverPaise : Math.round(total * 100);
      if (serverPaise > 0 && Math.abs(serverPaise / 100 - total) > 0.5) {
        setServerTotal(serverPaise / 100);
      }
      const rzp = new window.Razorpay({
        key,
        order_id: razorpayOrderId,
        amount: chargePaise,
        currency: res.currency || 'INR',
        name: process.env.NEXT_PUBLIC_STORE_NAME || 'ToolsKart',
        description: `Order ${receipt}`,
        prefill: { name: form.name, contact: form.phone },
        notes: { receipt },
        handler: function () {
          clearCart();
          clearCoupon();
          window.location.href = `/order-success?receipt=${encodeURIComponent(receipt)}&mode=${encodeURIComponent(form.payMode)}`;
        },
        modal: { ondismiss: function () { setBusy(false); } }
      });
      rzp.on('payment.failed', function (r) {
        setErr('Payment failed: ' + (r?.error?.description || 'try again'));
        setBusy(false);
      });
      rzp.open();
    } catch (e2) {
      setErr(e2.message || 'Checkout failed. Is the backend running?');
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Checkout</h1>
      <p className="text-sm text-gray-500 mt-1">{items.length} items • Subtotal ₹{subtotal.toLocaleString('en-IN')}{discount > 0 ? ` • Coupon −₹${discount.toLocaleString('en-IN')} • Total ₹${shown.toLocaleString('en-IN')}` : ` • Total ₹${shown.toLocaleString('en-IN')}`}{serverTotal != null ? ' (updated live)' : ''}</p>
      {couponNotice && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800">{couponNotice}</div>
      )}
      {coupon && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm flex justify-between items-center">
          <span><b>{coupon.code}</b> applied — you save <b className="text-green-700">₹{discount.toLocaleString('en-IN')}</b></span>
          <a href="/cart" className="text-xs font-bold text-[#F97316] underline">Change</a>
        </div>
      )}
      <form onSubmit={placeOrder} className="card p-5 mt-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Full name</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ravi Kumar" /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210" inputMode="numeric" /></div>
        </div>
        <div><label className="label">Full address</label><textarea className="input" rows={3} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="House no, street, city, state" /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Pincode</label><input className="input" value={form.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="110001" inputMode="numeric" /></div>
          <div>
            <label className="label">GSTIN <span className="text-gray-400 font-normal">(optional, for business invoices)</span></label>
            <input className="input uppercase" value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="27AABCU9603R1ZM" maxLength={20} />
          </div>
        </div>
        <div>
          <label className="label">Payment mode</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {['UPI', 'Card', 'EMI', 'COD'].map((m) => {
              // COD is capped server-side; disable it here so nobody picks an option
              // that will be rejected at the payment step.
              const disabled = m === 'COD' && shown > COD_MAX_RUPEES && form.payMode !== 'COD';
              const blocked = m === 'COD' && shown > COD_MAX_RUPEES;
              return (
                <label
                  key={m}
                  className={`border rounded-lg px-3 py-2.5 text-sm font-bold text-center ${blocked ? 'cursor-not-allowed opacity-50 text-gray-400' : 'cursor-pointer'} ${form.payMode === m ? 'border-[#F97316] bg-orange-50 text-[#EA580C]' : blocked ? '' : 'text-gray-600'}`}
                >
                  <input
                    type="radio"
                    name="payMode"
                    className="hidden"
                    checked={form.payMode === m}
                    disabled={disabled}
                    onChange={() => set('payMode', m)}
                  />
                  {m}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">UPI / Card / EMI go through Razorpay secure checkout. COD pays cash on delivery.</p>
          {shown > COD_MAX_RUPEES ? (
            <p className="text-xs text-amber-700 font-semibold mt-1">
              COD is available up to ₹{COD_MAX_RUPEES.toLocaleString('en-IN')} — this order needs online payment.
            </p>
          ) : null}
        </div>
        <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>₹{subtotal.toLocaleString('en-IN')}</span></div>
          {discount > 0 && coupon ? (
            <div className="flex justify-between text-green-700 font-bold"><span>Coupon {coupon.code}</span><span>−₹{discount.toLocaleString('en-IN')}</span></div>
          ) : null}
          <div className="flex justify-between text-gray-600">
            <span>Shipping</span>
            <span>{shipping > 0 ? `₹${shipping.toLocaleString('en-IN')}` : 'Free'}</span>
          </div>
          <div className="flex justify-between font-extrabold"><span>Total</span><span>₹{total.toLocaleString('en-IN')}</span></div>
        </div>
        {(() => {
          const gst = gstInclusiveSplit(shown);
          if (!gst.gstPaise) return null;
          return (
            <div className="text-xs text-gray-500 flex justify-between">
              <span>Inclusive of GST ({gst.rate}%)</span>
              <span>₹{(gst.gstPaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </div>
          );
        })()}
        {err && <p className="text-sm text-red-600 font-semibold">{err}</p>}
        <button disabled={busy} className="btn-primary w-full disabled:opacity-60">
          {busy ? 'Placing order...' : `Pay ₹${shown.toLocaleString('en-IN')} ${form.payMode === 'COD' ? '(COD)' : 'securely'}`}
        </button>
      </form>
    </div>
  );
}
