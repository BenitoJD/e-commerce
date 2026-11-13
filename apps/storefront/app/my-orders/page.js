'use client';

import { useEffect, useState } from 'react';
import { getMyOrders, trackOrder } from '../../lib/api';
import { addToCart, orderItemsToCartLines } from '../../lib/cart';
import { waLink, STORE } from '../../lib/store';

const inr = (paise) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(paise || 0) / 100
  );

function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (['cancelled', 'canceled', 'refunded', 'failed'].includes(s)) return 'bg-red-100 text-red-700';
  if (['delivered', 'paid'].includes(s)) return 'bg-green-100 text-green-800';
  if (['shipped', 'cod', 'cod_pending'].includes(s)) return 'bg-blue-100 text-blue-800';
  return 'bg-yellow-50 text-yellow-800';
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MyOrdersPage() {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem('tw_phone') || '';
      if (saved) setPhone(saved);
    } catch { /* ignore */ }
  }, []);

  const go = async (e) => {
    if (e) e.preventDefault();
    setErr('');
    setOrders(null);
    const p = phone.trim();
    if (!p) { setErr('Enter your order phone number.'); return; }
    setBusy(true);
    try {
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem('tw_phone', p); } catch { /* ignore */ }
      }
      const r = await getMyOrders(p);
      const list = Array.isArray(r) ? r : r.orders || r.items || [];
      setOrders(list);
      if (!list.length) setErr('No orders found for this phone number.');
    } catch (e2) {
      setErr(e2.message || 'Could not load orders. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // Rebuild the cart from a past order using the tracking endpoint, which is the only
  // place line items are exposed to a customer (guarded by receipt + phone).
  const reorder = async (receipt) => {
    setErr('');
    setBusy(true);
    try {
      const r = await trackOrder(receipt, phone.trim());
      const order = r.order || r;
      const lines = orderItemsToCartLines(order.items);
      if (!lines.length) { setErr('Could not load items for that order.'); return; }
      let added = 0;
      for (const line of lines) {
        if (line.price <= 0) continue; // unknown price: never add a free item
        addToCart(line, line.qty);
        added += 1;
      }
      if (!added) { setErr('Those items are not available to reorder right now.'); return; }
      window.location.href = '/cart';
    } catch (e2) {
      setErr(e2.message || 'Could not reorder. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">My Orders</h1>
      <p className="text-sm text-gray-500 mt-1">Enter the phone number you used at checkout to see all your orders.</p>

      <form onSubmit={go} className="card p-5 mt-5 flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="label">Phone</label>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98765 43210"
            inputMode="numeric" aria-label="Phone number" autoComplete="tel" />
        </div>
        <div className="flex items-end">
          <button disabled={busy} className="btn-primary w-full sm:w-auto disabled:opacity-60">
            {busy ? 'Loading...' : 'View Orders'}
          </button>
        </div>
      </form>
      {err && <p className="text-sm text-red-600 font-semibold mt-3">{err}</p>}

      {Array.isArray(orders) && orders.length > 0 && (
        <div className="mt-5 space-y-3">
          {orders.map((o, i) => {
            const receipt = o.receipt || o.id || o.orderId || '';
            const count = o.itemCount ?? o.item_count ?? (Array.isArray(o.items) ? o.items.length : 0);
            return (
              <div key={receipt || i} className="card p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px]">
                  <div className="font-bold">Receipt: {receipt || '—'}</div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {fmtDate(o.created_at || o.createdAt || o.date)} • {inr(o.amount_paise ?? o.amountPaise ?? (o.amount != null ? Number(o.amount) * 100 : 0))} • {count} item{Number(count) === 1 ? '' : 's'}
                  </div>
                  {Array.isArray(o.items) && o.items.length ? (
                    <div className="text-xs text-gray-600 mt-1">
                      {o.items.map((it) => `${it.name || it.slug}${Number(it.qty) > 1 ? ` ×${it.qty}` : ''}`).join(', ')}
                      {Number(count) > o.items.reduce((s2, it) => s2 + (Number(it.qty) || 0), 0) ? ' …' : ''}
                    </div>
                  ) : null}
                </div>
                <span className={`badge ${statusBadge(o.status)}`}>{String(o.status || 'placed').toUpperCase()}</span>
                <div className="flex gap-2 text-sm font-semibold">
                  {receipt && (
                    <a
                      href={`/track-order?receipt=${encodeURIComponent(receipt)}&phone=${encodeURIComponent(phone.trim())}`}
                      className="btn-outline !py-1.5"
                    >
                      Track
                    </a>
                  )}
                  {receipt && (
                    <a href={`/invoice/${encodeURIComponent(receipt)}`} className="btn-outline !py-1.5">
                      Invoice
                    </a>
                  )}
                  {receipt && ['delivered', 'shipped'].includes(String(o.status || '').toLowerCase()) && (
                    <a href={`/returns?receipt=${encodeURIComponent(receipt)}`} className="btn-outline !py-1.5">
                      Return
                    </a>
                  )}
                  {receipt && !['cancelled', 'refunded', 'failed'].includes(String(o.status || '').toLowerCase()) && (
                    <button onClick={() => reorder(receipt)} disabled={busy} className="btn-primary !py-1.5 disabled:opacity-60">
                      Reorder
                    </button>
                  )}
                  {receipt && (
                    <a
                      href={waLink(`Hi ${STORE.name}, I need help with order ${receipt}`)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-outline !py-1.5 !text-green-700"
                    >
                      Help
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-sm text-gray-500 mt-6">
        Know your receipt ID? <a href="/track-order" className="text-[#F97316] font-bold">Track an order →</a>
      </p>
    </div>
  );
}
