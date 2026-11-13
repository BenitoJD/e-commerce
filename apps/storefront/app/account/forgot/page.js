'use client';

import { useState } from 'react';
import { requestPasswordReset } from '../../../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [devUrl, setDevUrl] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setMsg(''); setDevUrl('');
    setBusy(true);
    try {
      const res = await requestPasswordReset(email.trim());
      setMsg(res.message || 'If an account exists for that email, a reset link has been sent.');
      if (res.devResetUrl) setDevUrl(res.devResetUrl);
    } catch (e2) {
      setErr(e2.message || 'Could not start the reset');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold">Reset your password</h1>
      <p className="text-sm text-gray-500 mt-1">We'll send a reset link that expires in 30 minutes.</p>
      <form onSubmit={submit} className="card p-5 mt-5 space-y-4">
        <div>
          <label className="label" htmlFor="forgot-email">Email</label>
          <input id="forgot-email" className="input" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        </div>
        {err && <p role="alert" className="text-sm text-red-600 font-semibold">{err}</p>}
        {msg && <p role="status" className="text-sm text-green-700 font-semibold">{msg}</p>}
        {devUrl && <p className="text-xs break-all bg-amber-50 border border-amber-200 rounded p-2">Development reset link: <a className="underline" href={devUrl}>{devUrl}</a></p>}
        <button disabled={busy} className="btn-primary w-full disabled:opacity-60">{busy ? 'Sending...' : 'Send reset link'}</button>
        <p className="text-sm text-center"><a href="/login" className="text-[#A95F32] font-semibold">Back to sign in</a></p>
      </form>
    </div>
  );
}
