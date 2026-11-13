'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { resetPassword } from '../../../lib/api';
import { clearToken } from '../../../lib/auth';

function ResetInner() {
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (password.length < 8) { setErr('Use a password with at least 8 characters.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await resetPassword({ token, password });
      // The server revoked every session; drop the browser's stale token too.
      clearToken();
      setDone(true);
    } catch (e2) {
      setErr(e2.message || 'Could not reset the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold">Choose a new password</h1>
      {!token ? (
        <p className="text-sm text-red-600 mt-3">This reset link is missing its token. Request a new link from <a className="underline" href="/account/forgot">Forgot password</a>.</p>
      ) : done ? (
        <div className="card p-5 mt-5 text-sm">
          <p className="text-green-700 font-semibold">Your password has been updated. All other sessions were signed out.</p>
          <a href="/login" className="btn-primary inline-block mt-4">Sign in</a>
        </div>
      ) : (
        <form onSubmit={submit} className="card p-5 mt-5 space-y-4">
          <div><label className="label" htmlFor="reset-password">New password</label>
            <input id="reset-password" className="input" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New password" /></div>
          <div><label className="label" htmlFor="reset-confirm">Confirm new password</label>
            <input id="reset-confirm" className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirm new password" /></div>
          {err && <p role="alert" className="text-sm text-red-600 font-semibold">{err}</p>}
          <button disabled={busy} className="btn-primary w-full disabled:opacity-60">{busy ? 'Updating...' : 'Update password'}</button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="max-w-md mx-auto px-4 py-12 text-gray-500">Loading…</div>}><ResetInner /></Suspense>;
}
