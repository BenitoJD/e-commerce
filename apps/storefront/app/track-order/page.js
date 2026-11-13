'use client';

import { useEffect, useRef, useState } from 'react';
import { cancelOrder, trackOrder } from '../../lib/api';
import { STORE } from '../../lib/store';

const STEPS = ['placed', 'paid', 'shipped', 'delivered'];
// Must stay in sync with backend cancellable statuses (pending, paid, cod_pending).
const CANCELLABLE = ['pending', 'paid', 'cod_pending', 'cod', 'payment pending', 'payment_pending', 'payment-pending', 'paymentpending', 'placed', 'unpaid'];

export default function TrackOrderPage() {
  const [receipt, setReceipt] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState('');
  const autoRan = useRef(false);

  const lookup = async (r, p) => {
    setErr('');
    setNotice('');
    setData(null);
    if (!String(r || '').trim() || !String(p || '').trim()) {
      setErr('Enter both receipt ID and phone number.');
      return;
    }
    setBusy(true);
    try {
      const res = await trackOrder(String(r).trim(), String(p).trim());
      setData(res.order || res);
    } catch (e2) {
      setErr(e2.message || 'Order not found. Check receipt & phone.');
    } finally {
      setBusy(false);
    }
  };

  // Prefill from the URL after mount (keeps the page server-renderable) and
  // auto-lookup when both receipt and phone were supplied.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const r = params.get('receipt') || '';
      const p = params.get('phone') || '';
      if (r) setReceipt(r);
      if (p) setPhone(p);
      if (r && p && !autoRan.current) {
        autoRan.current = true;
        lookup(r, p);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = async (e) => {
    e.preventDefault();
    autoRan.current = true;
    await lookup(receipt, phone);
  };

  const status = String(data?.status || '').toLowerCase();
  const terminal = ['cancelled', 'canceled', 'refunded', 'failed'].includes(status);
  const activeIdx = STEPS.indexOf(status);
  const cancellable = !terminal && CANCELLABLE.includes(status);

  const onCancel = async () => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Cancel order ${data?.receipt || receipt}? This cannot be undone.`);
      if (!ok) return;
    }
    setCancelling(true);
    setErr('');
    setNotice('');
    try {
      const wasPaid = String(data?.status || '').toLowerCase() === 'paid';
      const r = await cancelOrder(String(data?.receipt || receipt).trim(), phone.trim());
      let msg = `Order ${r.receipt || receipt} cancelled${r.status ? ` — status: ${r.status}` : ''}.`;
      if (r.refund === 'auto') msg += ' Refund initiated to source (3–5 working days).';
      else if (wasPaid) msg += ` Our team will process your refund; contact ${STORE.email} with your receipt.`;
      // Refresh the timeline first: lookup() clears the notice at its start, so setting the
      // confirmation before it would silently disappear (the order cancelled with no feedback).
      await lookup(data?.receipt || receipt, phone);
      setNotice(msg);
    } catch (e2) {
      setErr(e2.message || `Could not cancel this order. Contact ${STORE.email}.`);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Track Your Order</h1>
      <p className="text-sm text-gray-500 mt-1">Enter the receipt ID from your confirmation page and your order phone number.</p>
      <form onSubmit={go} className="card p-5 mt-5 grid sm:grid-cols-2 gap-4">
        <div><label className="label">Receipt ID</label><input className="input" value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="e.g. TK123456" aria-label="Receipt or order ID" /></div>
        <div><label className="label">Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" inputMode="numeric" aria-label="Phone number" autoComplete="tel" /></div>
        <div className="sm:col-span-2">
          {err && <p role="alert" className="text-sm text-red-600 font-semibold mb-2">{err}</p>}
          {notice && <p role="status" className="text-sm text-green-700 font-semibold mb-2">{notice}</p>}
          <button disabled={busy} className="btn-primary w-full disabled:opacity-60">{busy ? 'Tracking...' : 'Track Order'}</button>
        </div>
      </form>

      {data && (
        <div className="card p-5 mt-5">
          <div className="flex flex-wrap justify-between gap-2 items-center">
            <b>Receipt: {data.receipt || receipt}</b>
            <span className={`badge ${terminal ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-800'}`}>{String(data.status || 'placed').toUpperCase()}</span>
          </div>
          {data.amount_paise != null && <p className="text-sm mt-1">Amount: <b>₹{(Number(data.amount_paise) / 100).toLocaleString('en-IN')}</b></p>}
          {data.amount != null && data.amount_paise == null && <p className="text-sm mt-1">Amount: <b>₹{Number(data.amount).toLocaleString('en-IN')}</b></p>}

          {terminal ? (
            <p className="text-sm mt-4 text-red-700 font-semibold">
              This order is {status}. {status === 'refunded' ? 'Refund (if paid) reaches source in 3–5 working days.' : `Contact ${STORE.email} for help.`}
            </p>
          ) : (
            <div className="mt-5">
              <div className="flex items-center">
                {STEPS.map((s, i) => (
                  <div key={s} className="flex-1 flex items-center last:flex-none">
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-full grid place-items-center font-bold text-sm ${i <= activeIdx || activeIdx === -1 && i === 0 ? 'bg-[#F97316] text-white' : 'bg-gray-200 text-gray-500'}`}>
                        {i + 1}
                      </div>
                      <span className="text-[11px] font-bold mt-1 capitalize">{s}</span>
                    </div>
                    {i < STEPS.length - 1 && <div className={`flex-1 h-1 mx-1 rounded ${i < activeIdx ? 'bg-[#F97316]' : 'bg-gray-200'}`} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {cancellable && (
            <div className="mt-5 border-t pt-4">
              <button onClick={onCancel} disabled={cancelling} className="btn-outline !border-red-300 !text-red-600 w-full disabled:opacity-60">
                {cancelling ? 'Cancelling...' : 'Cancel order'}
              </button>
              <p className="text-xs text-gray-500 mt-1 text-center">COD & unpaid orders can be cancelled here. Paid-order refunds reach source in 3–5 working days.</p>
            </div>
          )}

          {data.awb || data.courier ? (
            <div className="mt-4 border-t pt-4 text-sm bg-gray-50 rounded-lg px-3 py-2">
              <b>Shipment</b>
              <div className="text-gray-700 mt-1">
                {data.courier ? `Courier: ${data.courier}` : ''}{data.courier && data.awb ? ' • ' : ''}{data.awb ? `AWB: ${data.awb}` : ''}
              </div>
              {data.trackingUrl ? (
                <a href={data.trackingUrl} target="_blank" rel="noreferrer" className="text-[#F97316] font-bold underline text-xs">Track with courier →</a>
              ) : null}
            </div>
          ) : null}

          {Array.isArray(data.timeline) && data.timeline.length > 0 && (
            <div className="mt-5 border-t pt-4 space-y-2">
              {data.timeline.map((t, i) => {
                // Steps carry a timestamp only when the backend actually recorded one;
                // never invent or reformat a date that isn't there.
                const when = t.at || t.time || t.date;
                const d = when ? new Date(when) : null;
                const stamp = d && !Number.isNaN(d.getTime())
                  ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
                  : '';
                return (
                  <div key={i} className="text-sm flex gap-2">
                    <span className="text-[#F97316] font-bold">•</span>
                    <span>
                      <b>{t.label || t.status || t.event || 'update'}</b>
                      {stamp ? <span className="text-gray-500"> — {stamp}</span> : null}
                      {t.note ? ` — ${t.note}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {Array.isArray(data.items) && data.items.length > 0 && (
            <div className="mt-5 border-t pt-4">
              <b className="text-sm">Items ({data.items.length})</b>
              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                {data.items.map((it, i) => (
                  <li key={i}>{it.qty ? `${it.qty} × ` : ''}{it.name || it.slug}{it.price ? ` — ₹${Number(it.price).toLocaleString('en-IN')}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
