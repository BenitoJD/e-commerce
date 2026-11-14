'use client';

import { useEffect, useState } from 'react';
import { requestReturn, getReturnStatus, checkReturnEligibility } from '../../lib/api';
import { STORE } from '../../lib/store';

const RETURN_STATUS_LABEL = {
  requested: 'Received',
  approved: 'Approved, pickup will be arranged',
  rejected: 'Rejected',
  picked_up: 'Picked up',
  refunded: 'Refunded',
  closed: 'Closed',
};

const REASONS = [
  { value: 'damaged', label: 'Arrived damaged' },
  { value: 'wrong-item', label: 'Wrong item delivered' },
  { value: 'defective', label: 'Defective / not working' },
  { value: 'not-needed', label: 'No longer needed' },
  { value: 'other', label: 'Other' },
];

export default function ReturnsPage() {
  const [form, setForm] = useState({
    receipt: '',
    phone: '',
    reason: 'damaged',
    details: '',
  });
  const [state, setState] = useState({ busy: false, ok: '', err: '', id: null });
  const [lookup, setLookup] = useState({ receipt: '', phone: '', busy: false, err: '', info: null });
  const [elig, setElig] = useState({ receipt: '', phone: '', busy: false, err: '', info: null });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function checkEligibility() {
    const receipt = elig.receipt.trim();
    const phone = elig.phone.trim();
    if (!receipt || !phone) {
      setElig((s) => ({ ...s, err: 'Enter both receipt ID and phone number.', info: null }));
      return;
    }
    setElig((s) => ({ ...s, busy: true, err: '', info: null }));
    try {
      const r = await checkReturnEligibility(receipt, phone);
      setElig((s) => ({ ...s, busy: false, info: r }));
    } catch (e) {
      setElig((s) => ({ ...s, busy: false, err: e.message || 'Could not check eligibility.', info: null }));
    }
  }

  async function checkStatus(e) {
    if (e) e.preventDefault();
    setLookup((l) => ({ ...l, busy: true, err: '', info: null }));
    const receipt = lookup.receipt.trim();
    const phone = lookup.phone.trim();
    if (!receipt || !phone) {
      setLookup((l) => ({ ...l, busy: false, err: 'Enter both receipt ID and phone number.' }));
      return;
    }
    try {
      const r = await getReturnStatus(receipt, phone);
      const found = r.return || r;
      if (!found) {
        setLookup((l) => ({ ...l, busy: false, err: 'No return request found for that order yet.' }));
      } else {
        setLookup((l) => ({ ...l, busy: false, info: found }));
      }
    } catch (err) {
      setLookup((l) => ({ ...l, busy: false, err: err.message || 'Could not check the status.' }));
    }
  }

  // Read ?receipt= after mount so the server can render the real form (no SSR bailout,
  // no "Loading..." flash, usable for crawlers and slow connections).
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('receipt');
      if (p) {
        setForm((f) => (f.receipt ? f : { ...f, receipt: p }));
        setElig((e) => (e.receipt ? e : { ...e, receipt: p }));
      }
    } catch { /* ignore */ }
  }, []);

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
        ok: `Return request #${r.id} received for ${r.receipt}. Our team reviews it within 1 working day, you'll get a call to arrange pickup.`,
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
        Damaged, wrong or defective item? File it here, we arrange pickup. Returns are accepted
        within <b>7 days of delivery</b>; see the{' '}
        <a href="/returns-policy" className="text-[#A95F32] font-bold underline">returns policy</a>.
      </p>

      <div className="card p-4 mt-5">
        <div className="font-bold text-sm">Can I still return this order?</div>
        <p className="text-xs text-gray-500 mt-1">Check before you fill the form, it takes a second.</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label className="label">Receipt / Order ID</label>
            <input
              className="input"
              value={elig.receipt}
              onChange={(e) => setElig((s) => ({ ...s, receipt: e.target.value, info: null, err: '' }))}
              placeholder="rcpt_1755…"
              aria-label="Receipt or order ID for eligibility check"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="label">Phone</label>
            <input
              className="input"
              value={elig.phone}
              onChange={(e) => setElig((s) => ({ ...s, phone: e.target.value, info: null, err: '' }))}
              placeholder="98765 43210"
              inputMode="numeric"
              aria-label="Phone number for eligibility check"
              autoComplete="tel"
            />
          </div>
          <button type="button" onClick={checkEligibility} disabled={elig.busy} className="btn-outline !py-2 disabled:opacity-60">
            {elig.busy ? 'Checking…' : 'Check'}
          </button>
        </div>
        {elig.err ? <p role="alert" className="text-sm text-red-600 font-semibold mt-2">{elig.err}</p> : null}
        {elig.info ? (
          <p role="status" className={`text-sm font-semibold mt-2 ${elig.info.eligible ? 'text-green-700' : 'text-amber-700'}`}>
            {elig.info.eligible
              ? `Eligible, about ${elig.info.daysLeft} day${elig.info.daysLeft === 1 ? '' : 's'} left in the ${elig.info.windowDays}-day window.`
              : (elig.info.reason || 'Not eligible for a return right now.')}
          </p>
        ) : null}
      </div>

      <form onSubmit={submit} className="card p-5 mt-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Receipt / Order ID</label>
            <input className="input" value={form.receipt} onChange={(e) => set('receipt', e.target.value)} placeholder="rcpt_1755…" aria-label="Receipt or order ID" />
          </div>
          <div>
            <label className="label">Phone used at checkout</label>
            <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="98765 43210" inputMode="numeric" aria-label="Phone number" autoComplete="tel" />
          </div>
        </div>

        <div>
          <label className="label">Reason</label>
          <select aria-label="Return reason" className="input" value={form.reason} onChange={(e) => set('reason', e.target.value)}>
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        <div>
          <label className="label">What happened?</label>
          <textarea aria-label="Return details" className="input" rows={4} value={form.details} onChange={(e) => set('details', e.target.value)} placeholder="Describe the issue. For damage, mention you have unboxing photos/video." />
        </div>

        {state.ok && <p role="status" className="text-sm text-green-700 font-semibold">{state.ok}</p>}
        {state.err && <p role="alert" className="text-sm text-red-600 font-semibold">{state.err}</p>}

        <button disabled={state.busy} className="btn-primary w-full disabled:opacity-60">
          {state.busy ? 'Submitting...' : 'File Return Request'}
        </button>
      </form>

      <div className="card p-5 mt-5">
        <h2 className="font-extrabold">Check a return&apos;s status</h2>
        <p className="text-xs text-gray-500 mt-1">Use the same receipt and phone you filed with.</p>
        <form onSubmit={checkStatus} className="mt-3 grid sm:grid-cols-[1fr_1fr_auto] gap-2">
          <input className="input" value={lookup.receipt} onChange={(e) => setLookup((l) => ({ ...l, receipt: e.target.value }))} placeholder="Receipt / Order ID" aria-label="Receipt or order ID" />
          <input className="input" value={lookup.phone} onChange={(e) => setLookup((l) => ({ ...l, phone: e.target.value }))} placeholder="Phone" inputMode="numeric" aria-label="Phone number" />
          <button disabled={lookup.busy} className="btn-outline whitespace-nowrap disabled:opacity-60">
            {lookup.busy ? 'Checking...' : 'Check'}
          </button>
        </form>
        {lookup.err ? <p className="text-xs text-gray-600 font-semibold mt-2">{lookup.err}</p> : null}
        {lookup.info ? (
          <div className="mt-3 text-sm bg-gray-50 rounded-lg px-3 py-2">
            <div className="flex justify-between"><span className="text-gray-500">Return #{lookup.info.id}</span>
              <span className="badge bg-gray-100">{RETURN_STATUS_LABEL[String(lookup.info.status)] || lookup.info.status}</span>
            </div>
            <div className="text-gray-600 mt-1">Reason: {lookup.info.reason || 'N/A'}</div>
            {lookup.info.details ? <div className="text-gray-500 text-xs mt-1">{lookup.info.details}</div> : null}
          </div>
        ) : null}
      </div>

      <p className="text-sm text-gray-500 mt-5">
        Need help instead? WhatsApp <a className="text-[#A95F32] font-bold" href={`https://wa.me/${STORE.phoneDigits}`}>{STORE.phoneDisplay}</a> or email {STORE.email}.
      </p>
    </div>
  );
}
