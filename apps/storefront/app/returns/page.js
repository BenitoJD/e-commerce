'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { requestReturn } from '../../lib/api';
import { STORE } from '../../lib/store';

const REASONS = [
  { value: 'damaged', label: 'Arrived damaged' },
  { value: 'wrong-item', label: 'Wrong item delivered' },
  { value: 'defective', label: 'Defective / not working' },
  { value: 'not-needed', label: 'No longer needed' },
  { value: 'other', label: 'Other' },
];

function ReturnInner() {
  const sp = useSearchParams();
  const [form, setForm] = useState({
    receipt: sp.get('receipt') || '',
    phone: '',
    reason: 'damaged',
    details: '',
  });
  const [state, setState] = useState({ busy: false, ok: '', err: '', id: null });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, ok: '', err: '', id: null });
    if (!form.receipt.trim()) {
      setState({ busy: false, ok: '', err: 'Enter your receipt / order ID.', id: null });
      return;
    }
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, '').slice(-10))) {
      setState({ busy: false, ok: '', err: 'Enter the 10-digit phone used at checkout.', id: null });
      return;
    }
    try {
      const r = await requestReturn({
        receipt: form.receipt.trim(),
        phone: form.phone.trim(),
        reason: form.reason,
        details: form.details.trim(),
      });
      setState({
        busy: false,
        ok: `Return request #${r.id} received for ${r.receipt}. Our team reviews it within 1 working day — you'll get a call to arrange pickup.`,
        err: '',
        id: r.id,
      });
      setForm({ receipt: '', phone: '', reason: 'damaged', details: '' });
    } catch (err) {
      setState({ busy: false, ok: '', err: err.message || 'Could not file the return. Contact us on WhatsApp.', id: null });
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Return or Exchange</h1>
      <p className="text-sm text-gray-500 mt-1">
        Damaged, wrong or defective item? File it here — we arrange pickup. See the{' '}
        <a href="/returns-policy" className="text-[#F97316] font-bold underline">returns policy</a> for eligibility.
      </p>

      <form onSubmit={submit} className="card p-5 mt-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Receipt / Order ID</label>
            <input className="input" value={form.receipt} onChange={(e) => set('receipt', e.target.value)} placeholder="rcpt_1755…" />
          </div>
          <div>
            <label className="label">Phone used at checkout</label>
            <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210" inputMode="numeric" />
          </div>
        </div>

        <div>
          <label className="label">Reason</label>
          <select className="input" value={form.reason} onChange={(e) => set('reason', e.target.value)}>
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        <div>
          <label className="label">What happened?</label>
          <textarea className="input" rows={4} value={form.details} onChange={(e) => set('details', e.target.value)} placeholder="Describe the issue. For damage, mention you have unboxing photos/video." />
        </div>

        {state.ok && <p className="text-sm text-green-700 font-semibold">{state.ok}</p>}
        {state.err && <p className="text-sm text-red-600 font-semibold">{state.err}</p>}

        <button disabled={state.busy} className="btn-primary w-full disabled:opacity-60">
          {state.busy ? 'Submitting...' : 'File Return Request'}
        </button>
      </form>

      <p className="text-sm text-gray-500 mt-5">
        Need help instead? WhatsApp <a className="text-[#F97316] font-bold" href={`https://wa.me/${STORE.phoneDigits}`}>{STORE.phoneDisplay}</a> or email {STORE.email}.
      </p>
    </div>
  );
}

export default function ReturnsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-500">Loading...</div>}>
      <ReturnInner />
    </Suspense>
  );
}
