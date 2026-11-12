'use client';

import { useEffect, useState } from 'react';
import { getCart, cartTotal, clearCart } from '../../../lib/cart';
import { createCheckout } from '../../../lib/api';

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

export default function CheckoutPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', address: '', pincode: '', payMode: 'UPI' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { setItems(getCart()); }, []);
  const total = cartTotal(items);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function placeOrder(e) {
    e.preventDefault();
    setErr('');
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
        customer: { name: form.name, phone: form.phone, address: form.address, pincode: form.pincode },
        items: items.map((i) => ({ slug: i.slug, qty: i.qty, price: i.price })),
        payMode: form.payMode,
        amount: total
      };
      const res = await createCheckout(payload);
      const receipt = res.receipt || res.receiptId || res.orderId || Date.now().toString();
      const razorpayOrderId = res.razorpayOrderId || res.razorpay_order_id || res.order_id;

      if (form.payMode === 'COD' || !razorpayOrderId) {
        clearCart();
        window.location.href = `/order-success?receipt=${encodeURIComponent(receipt)}&mode=COD`;
        return;
      }

      await loadRazorpay();
      const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      const rzp = new window.Razorpay({
        key,
        order_id: razorpayOrderId,
        amount: res.amount || total * 100,
        currency: res.currency || 'INR',
        name: process.env.NEXT_PUBLIC_STORE_NAME || 'ToolsKart',
        description: `Order ${receipt}`,
        prefill: { name: form.name, contact: form.phone },
        notes: { receipt },
        handler: function () {
          clearCart();
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
      <p className="text-sm text-gray-500 mt-1">{items.length} items • Total ₹{total.toLocaleString('en-IN')}</p>
      <form onSubmit={placeOrder} className="card p-5 mt-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Full name</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ravi Kumar" /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210" inputMode="numeric" /></div>
        </div>
        <div><label className="label">Full address</label><textarea className="input" rows={3} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="House no, street, city, state" /></div>
        <div><label className="label">Pincode</label><input className="input max-w-[200px]" value={form.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="110001" inputMode="numeric" /></div>
        <div>
          <label className="label">Payment mode</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {['UPI', 'Card', 'EMI', 'COD'].map((m) => (
              <label key={m} className={`border rounded-lg px-3 py-2.5 text-sm font-bold cursor-pointer text-center ${form.payMode === m ? 'border-[#F97316] bg-orange-50 text-[#EA580C]' : 'text-gray-600'}`}>
                <input type="radio" name="payMode" className="hidden" checked={form.payMode === m} onChange={() => set('payMode', m)} />{m}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">UPI / Card / EMI go through Razorpay secure checkout. COD pays cash on delivery.</p>
        </div>
        {err && <p className="text-sm text-red-600 font-semibold">{err}</p>}
        <button disabled={busy} className="btn-primary w-full disabled:opacity-60">
          {busy ? 'Placing order...' : `Pay ₹${total.toLocaleString('en-IN')} ${form.payMode === 'COD' ? '(COD)' : 'securely'}`}
        </button>
      </form>
    </div>
  );
}
