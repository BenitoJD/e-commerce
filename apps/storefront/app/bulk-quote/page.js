'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { createQuote, getMyQuotes } from '../../lib/api';

const QUOTE_STATUS_LABEL = {
  new: 'Received',
  contacted: 'We contacted you',
  quoted: 'Quote sent',
  won: 'Converted to order',
  lost: 'Closed',
};

function QuoteInner() {
  const sp = useSearchParams();
  const preSlug = sp.get('product') || '';
  const preName = sp.get('pname') || '';
  const [form, setForm] = useState({ name: '', phone: '', product: preSlug, productName: preName, qty: '10', message: '' });
  const [status, setStatus] = useState({ busy: false, ok: '', err: '' });
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookup, setLookup] = useState({ busy: false, rows: null, err: '' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function findQuotes(e) {
    if (e) e.preventDefault();
    setLookup({ busy: true, rows: null, err: '' });
    try {
      const r = await getMyQuotes(lookupPhone);
      const rows = Array.isArray(r) ? r : r.quotes || [];
      setLookup({ busy: false, rows, err: rows.length ? '' : 'No quote requests found for that number.' });
    } catch (err2) {
      setLookup({ busy: false, rows: null, err: err2.message || 'Could not load your quotes.' });
    }
  }

  async function submit(e) {
    e.preventDefault();
    setStatus({ busy: true, ok: '', err: '' });
    try {
      await createQuote({ ...form, product_slug: form.product, qty: Number(form.qty) || 1 });
      setStatus({ busy: false, ok: 'Quote request sent! Our B2B team will call you within 24 hours.', err: '' });
      setForm({ name: '', phone: '', product: '', productName: '', qty: '10', message: '' });
    } catch (err2) {
      setStatus({ busy: false, ok: '', err: err2.message || 'Failed to send. Try WhatsApp instead.' });
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Request Bulk Quote</h1>
      <p className="text-sm text-gray-500 mt-1">Wholesale pricing on 5+ units • GST invoice • freight support across India.</p>
      <form onSubmit={submit} className="card p-5 mt-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Your name" required aria-label="Your name" /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210" required aria-label="Phone number" /></div>
        </div>
        <div><label className="label">Product</label><input className="input" value={form.productName || form.product} onChange={(e) => setForm({ ...form, product: e.target.value, productName: '' })} placeholder="e.g. Bosch GSB 13 RE Drill" required aria-label="Product you need a quote for" /></div>
        <div><label className="label">Quantity</label><input type="number" min="1" className="input max-w-[160px]" value={form.qty} onChange={(e) => set('qty', e.target.value)} required aria-label="Quantity needed" /></div>
        <div><label className="label">Message</label><textarea className="input" rows={4} value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="Delivery city, GST number, timeline..." /></div>
        {status.ok && <p className="text-sm text-green-700 font-semibold">{status.ok}</p>}
        {status.err && <p className="text-sm text-red-600 font-semibold">{status.err}</p>}
        <button disabled={status.busy} className="btn-primary w-full disabled:opacity-60">{status.busy ? 'Sending...' : 'Send Quote Request'}</button>
      </form>

      <div className="card p-5 mt-5">
        <h2 className="font-extrabold">Already asked for a quote?</h2>
        <p className="text-xs text-gray-500 mt-1">Enter the phone number you used and we&apos;ll show its status.</p>
        <form onSubmit={findQuotes} className="mt-3 flex gap-2">
          <input value={lookupPhone} onChange={(e) => setLookupPhone(e.target.value)} placeholder="98765 43210" inputMode="numeric" className="input" aria-label="Phone number" />
          <button disabled={lookup.busy} className="btn-outline whitespace-nowrap disabled:opacity-60">
            {lookup.busy ? 'Checking...' : 'Check status'}
          </button>
        </form>
        {lookup.err ? <p className="text-xs text-gray-600 font-semibold mt-2">{lookup.err}</p> : null}
        {Array.isArray(lookup.rows) && lookup.rows.length > 0 ? (
          <ul className="mt-3 divide-y text-sm">
            {lookup.rows.map((q) => (
              <li key={q.id} className="py-2 flex flex-wrap items-center gap-2">
                <span className="font-semibold">{q.product_name || q.product_slug || 'Custom item'}</span>
                <span className="text-gray-500">× {q.qty}</span>
                <span className="badge bg-gray-100">{QUOTE_STATUS_LABEL[String(q.status)] || q.status}</span>
                {q.order_receipt ? <span className="text-xs text-green-700">order {q.order_receipt}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export default function BulkQuotePage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-500">Loading...</div>}>
      <QuoteInner />
    </Suspense>
  );
}
