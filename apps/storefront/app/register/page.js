'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerAccount } from '../../lib/api';
import { setToken } from '../../lib/auth';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.name.trim()) { setErr('Enter your name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setErr('Enter a valid email address.'); return; }
    if (form.phone.trim() && !/^(\+91[\s-]?)?[6-9]\d{9}$/.test(form.phone.replace(/[\s-]/g, ''))) {
      setErr('Enter a valid 10-digit mobile number, or leave it blank.');
      return;
    }
    if (form.password.length < 8) { setErr('Use a password with at least 8 characters.'); return; }
    if (form.password !== form.confirm) { setErr('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const res = await registerAccount({
        name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), password: form.password,
      });
      setToken(res.token);
      router.push('/account');
    } catch (e2) {
      setErr(e2.message || 'Could not create the account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold">Create your account</h1>
      <p className="text-sm text-gray-500 mt-1">Faster checkout, saved addresses and a full order history.</p>
      <form onSubmit={submit} className="card p-5 mt-5 space-y-4">
        <div><label className="label" htmlFor="reg-name">Full name</label>
          <input id="reg-name" className="input" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Full name" /></div>
        <div><label className="label" htmlFor="reg-email">Email</label>
          <input id="reg-email" className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-label="Email" /></div>
        <div><label className="label" htmlFor="reg-phone">Phone <span className="text-gray-400 font-normal">(optional, for delivery updates)</span></label>
          <input id="reg-phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-label="Phone number" /></div>
        <div><label className="label" htmlFor="reg-password">Password</label>
          <input id="reg-password" className="input" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} aria-label="Password" /></div>
        <div><label className="label" htmlFor="reg-confirm">Confirm password</label>
          <input id="reg-confirm" className="input" type="password" autoComplete="new-password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} aria-label="Confirm password" /></div>
        {err && <p role="alert" className="text-sm text-red-600 font-semibold">{err}</p>}
        <button disabled={busy} className="btn-primary w-full disabled:opacity-60">{busy ? 'Creating account...' : 'Create account'}</button>
        <p className="text-sm text-center">Already have an account? <a href="/login" className="text-[#F97316] font-semibold">Sign in</a></p>
      </form>
    </div>
  );
}
