'use client';

import { useState } from 'react';
import { subscribe } from '../lib/api';

export default function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (e) => {
    e.preventDefault();
    setMsg('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setMsg('Enter a valid email.'); return; }
    setBusy(true);
    try {
      await subscribe(email.trim());
      setMsg('Subscribed! Watch your inbox for deals.');
      setEmail('');
    } catch (e2) {
      setMsg(e2.message || 'Could not subscribe. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={go} className="mt-3">
      <div className="flex gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for deals & offers" className="input !bg-white/10 !border-white/20 !text-white placeholder:text-gray-400" aria-label="Email address for the newsletter" />
        <button disabled={busy} className="bg-[#A95F32] text-white font-bold px-4 rounded-lg text-sm disabled:opacity-60">Join</button>
      </div>
      {msg && <p className="text-xs mt-2 text-orange-200">{msg}</p>}
    </form>
  );
}
