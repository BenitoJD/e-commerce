'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginAccount } from '../../lib/api';
import { setToken } from '../../lib/auth';

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const redirect = sp.get('redirect') || '/account';
  const [form, setForm] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await loginAccount({ email: form.email, password: form.password });
      setToken(res.token);
      router.push(redirect);
    } catch (e2) {
      setErr(e2.message || 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold">Sign in</h1>
      <p className="text-sm text-gray-500 mt-1">Save addresses, track orders and check out faster.</p>
      <form onSubmit={submit} className="card p-5 mt-5 space-y-4">
        <div>
          <label className="label" htmlFor="login-email">Email</label>
          <input id="login-email" className="input" type="email" autoComplete="email" required
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-label="Email" />
        </div>
        <div>
          <label className="label" htmlFor="login-password">Password</label>
          <input id="login-password" className="input" type="password" autoComplete="current-password" required
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} aria-label="Password" />
        </div>
        {err && <p role="alert" className="text-sm text-red-600 font-semibold">{err}</p>}
        <button disabled={busy} className="btn-primary w-full disabled:opacity-60">{busy ? 'Signing in...' : 'Sign in'}</button>
        <div className="flex justify-between text-sm">
          <a href="/account/forgot" className="text-[#F97316] font-semibold">Forgot password?</a>
          <a href="/register" className="text-[#F97316] font-semibold">Create an account</a>
        </div>
      </form>
      <p className="text-xs text-gray-500 mt-4">
        Guest checkout stays available. To see orders placed without an account, use <a className="underline" href="/my-orders">My Orders</a> and verify your phone.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className="max-w-md mx-auto px-4 py-12 text-gray-500">Loading…</div>}><LoginInner /></Suspense>;
}
