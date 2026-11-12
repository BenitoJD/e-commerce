'use client';

import { useState } from 'react';
import { trackOrder } from '../../lib/api';

const STEPS = ['placed', 'paid', 'shipped', 'delivered'];

export default function TrackOrderPage() {
  const [receipt, setReceipt] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);

  const go = async (e) => {
    e.preventDefault();
    setErr('');
    setData(null);
    if (!receipt.trim() || !phone.trim()) { setErr('Enter both receipt ID and phone number.'); return; }
    setBusy(true);
    try {
      const r = await trackOrder(receipt.trim(), phone.trim());
      setData(r.order || r);
    } catch (e2) {
      setErr(e2.message || 'Order not found. Check receipt & phone.');
    } finally {
      setBusy(false);
    }
  };

  const status = String(data?.status || '').toLowerCase();
  const terminal = ['cancelled', 'canceled', 'refunded', 'failed'].includes(status);
  const activeIdx = STEPS.indexOf(status);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Track Your Order</h1>
      <p className="text-sm text-gray-500 mt-1">Enter the receipt ID from your confirmation page and your order phone number.</p>
      <form onSubmit={go} className="card p-5 mt-5 grid sm:grid-cols-2 gap-4">
        <div><label className="label">Receipt ID</label><input className="input" value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="e.g. TK123456" /></div>
        <div><label className="label">Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" inputMode="numeric" /></div>
        <div className="sm:col-span-2">
          {err && <p className="text-sm text-red-600 font-semibold mb-2">{err}</p>}
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
              This order is {status}. {status === 'refunded' ? 'Refund (if paid) reaches source in 3–5 working days.' : 'Contact care@toolskart.in for help.'}
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

          {Array.isArray(data.timeline) && data.timeline.length > 0 && (
            <div className="mt-5 border-t pt-4 space-y-2">
              {data.timeline.map((t, i) => (
                <div key={i} className="text-sm flex gap-2">
                  <span className="text-[#F97316] font-bold">•</span>
                  <span><b className="capitalize">{t.status || t.event || 'update'}</b> <span className="text-gray-500">{t.at || t.time || t.date || ''}</span>{t.note ? ` — ${t.note}` : ''}</span>
                </div>
              ))}
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
