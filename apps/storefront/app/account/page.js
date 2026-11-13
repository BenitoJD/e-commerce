'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchMe, fetchAccountOrders, saveAddress, deleteAddress, logoutAccount, getStates,
} from '../../lib/api';
import { getToken, clearToken } from '../../lib/auth';

const inr = (paise) => `₹${Math.round(Number(paise || 0) / 100).toLocaleString('en-IN')}`;

const EMPTY_ADDRESS = {
  label: 'Home', name: '', phone: '', address: '', pincode: '', stateCode: '', isDefault: false,
};

export default function AccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [tab, setTab] = useState('orders');
  const [form, setForm] = useState(EMPTY_ADDRESS);
  const [states, setStates] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    try {
      const [me, ord] = await Promise.all([fetchMe(token), fetchAccountOrders(token).catch(() => ({ orders: [] }))]);
      setUser(me.user);
      setAddresses(me.addresses || []);
      setOrders(ord.orders || []);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getStates()
      .then((r) => setStates(Array.isArray(r) ? r : (r && r.states) || []))
      .catch(() => { /* keep the address form usable; the state stays optional */ });
  }, []);

  const logout = async () => {
    try { await logoutAccount(getToken()); } catch { /* ignore */ }
    clearToken();
    setUser(null);
    router.push('/');
  };

  const addAddress = async (e) => {
    e.preventDefault();
    setErr(''); setMsg('');
    setBusy(true);
    try {
      const res = await saveAddress(getToken(), form);
      setAddresses((prev) => [res.address, ...prev.filter((a) => a.id !== res.address.id)]);
      setForm(EMPTY_ADDRESS);
      setMsg('Address saved.');
      await load();
    } catch (e2) {
      setErr(e2.message || 'Could not save the address');
    } finally {
      setBusy(false);
    }
  };

  const removeAddress = async (id) => {
    setErr(''); setMsg('');
    try {
      await deleteAddress(getToken(), id);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch (e2) {
      setErr(e2.message || 'Could not remove the address');
    }
  };

  const makeDefault = async (a) => {
    setErr('');
    try {
      const res = await saveAddress(getToken(), { ...a, isDefault: true }, a.id);
      setAddresses((prev) => prev.map((x) => (x.id === res.address.id ? res.address : { ...x, is_default: false })));
    } catch (e2) {
      setErr(e2.message || 'Could not update the address');
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-extrabold">Your account</h1>
        <p className="text-gray-500 mt-3">Loading your account…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-extrabold">Your account</h1>
        <p className="text-sm text-gray-600 mt-2">Sign in to see your orders, save addresses and check out faster.</p>
        <div className="mt-5 flex justify-center gap-3">
          <a href="/login" className="btn-primary">Sign in</a>
          <a href="/register" className="btn-outline">Create account</a>
        </div>
        <p className="text-xs text-gray-500 mt-5">Ordered as a guest? <a className="underline" href="/my-orders">Look up orders by phone</a>.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Hi, {user.name || 'there'}</h1>
          <p className="text-sm text-gray-500">{user.email}{user.phone ? ` • ${user.phone}` : ''}</p>
        </div>
        <button onClick={logout} className="btn-outline !py-2">Sign out</button>
      </div>

      <div className="flex gap-2 mt-5">
        {[['orders', `Orders (${orders.length})`], ['addresses', `Addresses (${addresses.length})`], ['profile', 'Profile']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={tab === key ? 'btn-primary !py-2' : 'btn-outline !py-2'}>{label}</button>
        ))}
      </div>

      {msg && <p role="status" className="text-sm text-green-700 font-semibold mt-3">{msg}</p>}
      {err && <p role="alert" className="text-sm text-red-600 font-semibold mt-3">{err}</p>}

      {tab === 'orders' && (
        <div className="mt-5 space-y-3">
          {orders.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="font-bold">No orders yet</p>
              <a href="/category/all" className="btn-primary inline-block mt-4">Start shopping</a>
            </div>
          ) : orders.map((o) => (
            <div key={o.receipt} className="card p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <b className="text-sm">{o.receipt}</b>
                  <p className="text-xs text-gray-500">{new Date(o.created_at).toLocaleString('en-IN')} • {o.pay_mode === 'cod' ? 'COD' : 'Online'}</p>
                </div>
                <span className="badge bg-gray-100 text-gray-700">{String(o.status).replace(/_/g, ' ').toUpperCase()}</span>
              </div>
              <ul className="mt-2 text-sm text-gray-700">
                {(o.items || []).map((it, i) => <li key={i}>{it.qty} × {it.name || it.slug}</li>)}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                <b>{inr(o.amount_paise)}</b>
                <div className="flex gap-3 text-xs font-bold">
                  <a className="text-[#F97316] underline" href={`/invoice/${encodeURIComponent(o.receipt)}`}>Invoice</a>
                  <a className="text-[#F97316] underline" href={`/track-order?receipt=${encodeURIComponent(o.receipt)}`}>Track</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'addresses' && (
        <div className="mt-5 grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            {addresses.length === 0 ? <p className="text-sm text-gray-500">No saved addresses yet.</p> : addresses.map((a) => (
              <div key={a.id} className="card p-4 text-sm">
                <div className="flex justify-between">
                  <b>{a.label}{a.is_default ? ' • Default' : ''}</b>
                  {!a.is_default && <button onClick={() => makeDefault(a)} className="text-xs text-[#F97316] font-bold">Make default</button>}
                </div>
                <p className="mt-1">{a.name} — {a.phone}</p>
                <p className="text-gray-600">{a.address}, {a.pincode}, {a.state}</p>
                <button onClick={() => removeAddress(a.id)} className="text-xs text-red-600 font-bold mt-2">Remove</button>
              </div>
            ))}
          </div>
          <form onSubmit={addAddress} className="card p-4 space-y-3 h-fit">
            <b className="text-sm">Add an address</b>
            <input className="input" placeholder="Label (Home, Office)" aria-label="Address label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <input className="input" placeholder="Full name" aria-label="Address full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="Phone" aria-label="Address phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <textarea className="input" rows={3} placeholder="Street, city, landmark" aria-label="Address street" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Pincode" aria-label="Address pincode" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
              <select className="input" aria-label="Address state" value={form.stateCode} onChange={(e) => setForm({ ...form, stateCode: e.target.value })}>
                <option value="">State</option>
                {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Make this my default</label>
            <button disabled={busy} className="btn-primary w-full disabled:opacity-60">{busy ? 'Saving...' : 'Save address'}</button>
          </form>
        </div>
      )}

      {tab === 'profile' && (
        <div className="card p-5 mt-5 text-sm space-y-2">
          <p><span className="text-gray-500">Name:</span> <b>{user.name}</b></p>
          <p><span className="text-gray-500">Email:</span> <b>{user.email}</b></p>
          <p><span className="text-gray-500">Phone:</span> <b>{user.phone || 'Not set'}</b></p>
          <p><span className="text-gray-500">Member since:</span> <b>{new Date(user.createdAt).toLocaleDateString('en-IN')}</b></p>
          <a href="/account/forgot" className="text-[#F97316] font-bold underline inline-block pt-2">Change password</a>
        </div>
      )}
    </div>
  );
}
