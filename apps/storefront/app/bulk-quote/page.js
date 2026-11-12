'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { createQuote } from '../../lib/api';

function QuoteInner() {
  const sp = useSearchParams();
  const preSlug = sp.get('product') || '';
  const preName = sp.get('pname') || '';
  const [form, setForm] = useState({ name: '', phone: '', product: preSlug, productName: preName, qty: '10', message: '' });
  const [status, setStatus] = useState({ busy: false, ok: '', err: '' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
          <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Your name" required /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210" required /></div>
        </div>
        <div><label className="label">Product</label><input className="input" value={form.productName || form.product} onChange={(e) => setForm({ ...form, product: e.target.value, productName: '' })} placeholder="e.g. Bosch GSB 13 RE Drill" required /></div>
        <div><label className="label">Quantity</label><input type="number" min="1" className="input max-w-[160px]" value={form.qty} onChange={(e) => set('qty', e.target.value)} required /></div>
        <div><label className="label">Message</label><textarea className="input" rows={4} value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="Delivery city, GST number, timeline..." /></div>
        {status.ok && <p className="text-sm text-green-700 font-semibold">{status.ok}</p>}
        {status.err && <p className="text-sm text-red-600 font-semibold">{status.err}</p>}
        <button disabled={status.busy} className="btn-primary w-full disabled:opacity-60">{status.busy ? 'Sending...' : 'Send Quote Request'}</button>
      </form>
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
