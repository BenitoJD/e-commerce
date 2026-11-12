'use client';

import { useState } from 'react';
import { sendContactMessage } from '../../lib/api';
import { STORE, waLink } from '../../lib/store';

export default function ContactUs() {
  const [form, setForm] = useState({ name: '', phone: '', message: '' });
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.name.trim() || !form.message.trim()) {
      setErr('Please fill your name and message.');
      return;
    }
    setBusy(true);
    try {
      await sendContactMessage({ name: form.name.trim(), phone: form.phone.trim(), message: form.message.trim() });
      setSent(true);
    } catch (e2) {
      setErr(e2.message || 'Could not send. Call us on the helpline instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Contact Us</h1>
      <div className="grid sm:grid-cols-2 gap-4 mt-5">
        <div className="card p-5 text-sm">
          <b>Helpline</b>
          <p className="mt-2">Phone / WhatsApp: <a className="text-[#F97316] font-bold" href={waLink()}>{STORE.phoneDisplay}</a></p>
          <p className="mt-1">Email: {STORE.email}</p>
          <p className="mt-1 text-gray-500">Mon–Sat, 9am–7pm IST</p>
        </div>
        <div className="card p-5 text-sm">
          <b>Quick help</b>
          <p className="mt-2"><a href="/track-order" className="text-[#F97316] font-bold underline">Track your order</a></p>
          <p className="mt-1"><a href="/bulk-quote" className="text-[#F97316] font-bold underline">Request a bulk quote</a></p>
          <p className="mt-1"><a href="/shipping-policy" className="text-[#F97316] font-bold underline">Shipping policy</a></p>
        </div>
      </div>
      <form onSubmit={send} className="card p-5 mt-4 space-y-3">
        {sent ? (
          <p className="text-sm text-green-700 font-semibold">Thanks {form.name.split(' ')[0] || 'there'}! We&apos;ll call you back within one working day.</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" aria-label="Your name" /></div>
              <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98765 43210" inputMode="numeric" aria-label="Phone number" /></div>
            </div>
            <div><label className="label">Message</label><textarea className="input" rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="How can we help?" /></div>
            {err ? <p className="text-xs text-red-600 font-semibold">{err}</p> : null}
            <button className="btn-primary disabled:opacity-60" disabled={busy}>{busy ? 'Sending...' : 'Send Message'}</button>
          </>
        )}
      </form>
    </div>
  );
}
