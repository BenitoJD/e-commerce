'use client';

import { useEffect, useState } from 'react';
import { getCart, cartTotal, clearCart } from '../../lib/cart';
import { getToken } from '../../lib/auth';
import { fitClass } from '../../lib/image';
import { gstInclusiveSplit } from '../../lib/pricing';
import { isValidGstin } from '../../lib/gstin';
import { createCheckout, completeMockPayment, validateCoupon, getStates, fetchMe } from '../../lib/api';
import { normalizeStates, stateFieldRequired, stateForPayload } from '../../lib/stateOptions';
import { COD_MAX_RUPEES, SHIPPING_FEE_RUPEES, shippingFor, STORE } from '../../lib/store';

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
    const raw = JSON.parse(localStorage.getItem('tw_coupon') || 'null');
    if (!raw || typeof raw !== 'object') return null;
    // Coerce before rendering: a corrupted object in `code` used to crash the page with
    // "Objects are not valid as a React child", and "Try again" re-rendered the same crash.
    const code = typeof raw.code === 'string' ? raw.code.trim().toUpperCase() : '';
    const discountPaise = Number(raw.discountPaise);
    if (!code || !Number.isFinite(discountPaise) || discountPaise < 0) return null;
    return { code, discountPaise };
  } catch {
    return null;
  }
}

export default function CheckoutPage() {
  const [items, setItems] = useState([]);
  const [coupon, setCoupon] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', pincode: '', stateCode: '', gstin: '', payMode: 'UPI', notes: '' });
  const [states, setStates] = useState([]);
  const [saved, setSaved] = useState([]);
  const [prefilled, setPrefilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [serverTotal, setServerTotal] = useState(null); // authoritative total returned by backend
  // Development mock gateway: the backend returns a mock order id when Razorpay keys are
  // absent, and this lets the buyer finish that payment instead of being stuck.
  const [mockOrder, setMockOrder] = useState(null);

  useEffect(() => {
    setItems(getCart());
    setCoupon(readCoupon());
    // Delivery states come from the backend so the picker and the invoice agree on the
    // GST state list. A failed fetch just leaves the picker empty (state stays optional).
    let alive = true;
    getStates()
      .then((r) => { if (alive) setStates(normalizeStates(r)); })
      .catch(() => { /* keep the form usable without the list */ });
    // Signed-in shoppers get their name/email and default address filled in for them.
    const token = getToken();
    if (token) {
      fetchMe(token)
        .then((r) => {
          if (!alive || !r || !r.user) return;
          setSaved(Array.isArray(r.addresses) ? r.addresses : []);
          const def = (r.addresses || []).find((a) => a.is_default) || (r.addresses || [])[0];
          setForm((f) => ({
            ...f,
            name: f.name || r.user.name || '',
            email: f.email || r.user.email || '',
            phone: f.phone || (def && def.phone) || r.user.phone || '',
            address: f.address || (def && def.address) || '',
            pincode: f.pincode || (def && def.pincode) || '',
            stateCode: f.stateCode || (def && def.state_code) || '',
            gstin: f.gstin || '',
          }));
          setPrefilled(true);
        })
        .catch(() => { /* guest checkout stays available */ });
    }
    return () => { alive = false; };
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

  // Accept the formats people actually paste: +91 98765 43210, 098765 43210, spaces/dashes.
  const normalizePhoneInput = (raw) => {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    return digits.slice(-10);
  };

  const applySavedAddress = (id) => {
    const a = saved.find((x) => String(x.id) === String(id));
    if (!a) return;
    setForm((f) => ({
      ...f,
      name: a.name || f.name,
      phone: a.phone || f.phone,
      address: a.address || f.address,
      pincode: a.pincode || f.pincode,
      stateCode: a.state_code || f.stateCode,
    }));
  };

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

  async function payMock() {
    if (!mockOrder) return;
    setErr('');
    setBusy(true);
    try {
      await completeMockPayment(mockOrder.receipt);
      clearCart();
      clearCoupon();
      window.location.href = `/order-success?receipt=${encodeURIComponent(mockOrder.receipt)}&mode=${encodeURIComponent(mockOrder.mode)}`;
    } catch (e2) {
      setErr(e2.message || 'Mock payment failed. Is the backend running?');
      setBusy(false);
    }
  }

  async function placeOrder(e) {
    e.preventDefault();
    setErr('');
    setServerTotal(null);
    if (!items.length) { setErr('Cart is empty.'); return; }
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim() || !form.pincode.trim()) {
      setErr('Please fill name, phone, address and pincode.');
      return;
    }
    const normalizedPhone = normalizePhoneInput(form.phone);
    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) { setErr('Enter a valid 10-digit mobile number.'); return; }
    if (!/^\d{6}$/.test(form.pincode)) { setErr('Enter a valid 6-digit pincode.'); return; }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setErr('Enter a valid email address for order updates.'); return; }
    // GSTIN is optional, but a wrong one prints a tax invoice the buyer cannot use.
    if (form.gstin.trim() && !isValidGstin(form.gstin)) {
      setErr('That GSTIN looks invalid — check the 15-character number on your GST certificate.');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        customer: { name: form.name, email: form.email.trim(), phone: normalizedPhone, address: form.address, pincode: form.pincode, stateCode: stateForPayload(states, form.stateCode), gstin: form.gstin.trim() || null },
        items: items.map((i) => ({ slug: i.slug, qty: i.qty, price: i.price })),
        // API contract is lowercase; the label is only for display.
        payMode: form.payMode === 'COD' ? 'cod' : 'online',
        amount: total,
        subtotal,
        couponCode: coupon ? coupon.code : undefined,
        discount: discount || 0,
        notes: form.notes.trim().slice(0, 500),
      };
      const res = await createCheckout(payload, getToken());
      const receipt = res.receipt || res.receiptId || res.orderId || Date.now().toString();
      const razorpayOrderId = res.razorpayOrderId || res.razorpay_order_id || res.order_id;
      try { if (typeof window !== 'undefined') window.localStorage.setItem('tw_phone', normalizedPhone); } catch { /* ignore */ }

      if (form.payMode === 'COD' || !razorpayOrderId) {
        clearCart();
        clearCoupon();
        window.location.href = `/order-success?receipt=${encodeURIComponent(receipt)}&mode=COD`;
        return;
      }

      // No gateway configured locally: show the explicit simulation step rather than a
      // Razorpay sheet that can never succeed with a placeholder key.
      if (res.mock) {
        setMockOrder({ receipt, amount: Number(res.amount_paise || 0) / 100, mode: form.payMode });
        setBusy(false);
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
        name: STORE.name,
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
      {items.length === 0 && (
        <div role="alert" className="card p-4 mt-4 border-amber-300 bg-amber-50 text-sm">
          <b>Your cart is empty — add a product before checking out.</b>
          <a href="/category/all" className="block text-[#F97316] font-bold mt-2">Browse products →</a>
        </div>
      )}
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
      {Array.isArray(items) && items.length > 0 && (
        <div className="card p-4 mt-5">
          <div className="flex items-center justify-between">
            <b className="text-sm">Order summary</b>
            <a href="/cart" className="text-xs font-bold text-[#F97316] underline">Edit cart</a>
          </div>
          <ul className="mt-3 divide-y text-sm">
            {items.map((i) => (
              <li key={i.slug} className="py-2 flex items-center gap-3">
                {i.image ? (
                  <img src={i.image} alt={i.name} className={fitClass(i.image, 'w-12 h-12 rounded border object-cover bg-white')} loading="lazy" />
                ) : null}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{i.name}</div>
                  <div className="text-xs text-gray-500">Qty {i.qty} × ₹{Number(i.price).toLocaleString('en-IN')}</div>
                </div>
                <div className="font-bold whitespace-nowrap">₹{(Number(i.price) * Number(i.qty)).toLocaleString('en-IN')}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form onSubmit={placeOrder} className="card p-5 mt-5 space-y-4">
        {saved.length > 0 && (
          <div>
            <label className="label" htmlFor="saved-address">Saved address</label>
            <select id="saved-address" className="input" defaultValue="" onChange={(e) => applySavedAddress(e.target.value)} aria-label="Use a saved address">
              <option value="">Enter a new address</option>
              {saved.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.address}, {a.pincode}</option>)}
            </select>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label" htmlFor="checkout-name">Full name</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ravi Kumar" aria-label="Full name" autoComplete="name" required /></div>
          <div><label className="label" htmlFor="checkout-phone">Phone</label><input id="checkout-phone" className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210" inputMode="tel" aria-label="Phone number" autoComplete="tel" required /></div>
        </div>
        <div><label className="label" htmlFor="checkout-email">Email <span className="text-gray-400 font-normal">(order confirmation & updates)</span></label><input id="checkout-email" className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" aria-label="Email for order updates" autoComplete="email" required /></div>
        <div><label className="label">Full address</label><textarea className="input" rows={3} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="House no, street, city, state" aria-label="Delivery address" autoComplete="street-address" required /></div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Pincode</label><input className="input" value={form.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="110001" inputMode="numeric" aria-label="Pincode" autoComplete="postal-code" required /></div>
          <div>
            <label className="label">Delivery state</label>
            <select
              className="input"
              value={form.stateCode}
              onChange={(e) => set('stateCode', e.target.value)}
              aria-label="Delivery state"
              autoComplete="address-level1"
              required={stateFieldRequired(states)}
            >
              <option value="">Select state</option>
              {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
            {/* The state decides the invoice's place of supply (CGST+SGST vs IGST). */}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">GSTIN <span className="text-gray-400 font-normal">(optional, for business invoices)</span></label>
            <input className="input uppercase" value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="27AABCU9603R1ZM" maxLength={20} aria-label="GSTIN for business invoice" autoComplete="off" />
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
                  <span className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="payMode"
                      className="h-4 w-4 accent-[#F97316]"
                      checked={form.payMode === m}
                      disabled={disabled}
                      onChange={() => set('payMode', m)}
                      aria-label={m}
                    />
                    {m}
                  </span>
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
        <div>
          <label className="label" htmlFor="checkout-notes">Order notes <span className="text-gray-400 font-normal">(optional)</span></label>
          <textarea id="checkout-notes" className="input" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value.slice(0, 500))} placeholder="Delivery instructions, landmark, GST details…" aria-label="Order notes" />
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
        {mockOrder ? (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-4" role="status">
            <b className="text-sm">Development payment (Razorpay is not configured)</b>
            <p className="text-xs text-gray-600 mt-1">
              Order <b>{mockOrder.receipt}</b> for ₹{Number(mockOrder.amount).toLocaleString('en-IN')} is reserved.
              Simulate the gateway callback to mark it paid and see the post-purchase flow.
            </p>
            <button type="button" onClick={payMock} disabled={busy} className="btn-primary w-full mt-3 disabled:opacity-60">
              {busy ? 'Confirming...' : 'Simulate successful payment'}
            </button>
            <a href="/cart" className="block text-center text-xs font-bold text-[#F97316] mt-2">Back to cart</a>
          </div>
        ) : (
          <>
            {err && <p role="alert" className="text-sm text-red-600 font-semibold">{err}</p>}
            <button disabled={busy || items.length === 0} className="btn-primary w-full disabled:opacity-60">
              {busy ? 'Placing order...' : `Pay ₹${shown.toLocaleString('en-IN')} ${form.payMode === 'COD' ? '(COD)' : 'securely'}`}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
