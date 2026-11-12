'use client';

import { useEffect, useState } from 'react';
import {
  getAdminStats,
  getAdminOrders,
  updateOrderStatus,
  getAdminQuotes,
  updateQuoteStatus,
  convertQuote,
  listCoupons,
  saveCoupon,
  toggleCoupon,
  getAdminMessages,
  updateMessageStatus,
  getAdminReviews,
  setReviewVerified,
  deleteReview,
  updateStock
} from '../../lib/api';

function inrFromPaise(paise) {
  const n = Number(paise || 0) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function inrMaybe(v) {
  // stats may return paise or rupees; if value looks like paise (>10000) treat as paise
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  if (n >= 10000) return inrFromPaise(n);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

const ORDER_STATUSES = ['pending', 'paid', 'cod', 'shipped', 'delivered', 'cancelled', 'refunded', 'failed'];
const QUOTE_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [input, setInput] = useState('');
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState('');
  const [quotes, setQuotes] = useState([]);
  const [quoteFilter, setQuoteFilter] = useState('');

  const [slug, setSlug] = useState('');
  const [stock, setStock] = useState('');
  const [stockResult, setStockResult] = useState(null);
  const [convertMsg, setConvertMsg] = useState('');

  const [coupons, setCoupons] = useState([]);
  const [couponForm, setCouponForm] = useState({ code: '', pct: '', maxRs: '', minRs: '' });
  const [couponMsg, setCouponMsg] = useState('');

  const [messages, setMessages] = useState([]);
  const [msgFilter, setMsgFilter] = useState('');
  const [modReviews, setModReviews] = useState([]);
  const [modVerified, setModVerified] = useState('false');

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('tk_admin') || '';
      setToken(saved);
      setInput(saved);
    } catch {}
  }, []);

  function saveToken() {
    try {
      sessionStorage.setItem('tk_admin', input);
    } catch {}
    setToken(input);
    setError('');
  }

  function clearToken() {
    try {
      sessionStorage.removeItem('tk_admin');
    } catch {}
    setToken('');
    setStats(null);
    setOrders([]);
    setQuotes([]);
  }

  async function loadStats() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const s = await getAdminStats(token);
      setStats(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await getAdminOrders(token, orderFilter);
      setOrders(Array.isArray(data) ? data : data.orders || data.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadQuotes() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await getAdminQuotes(token, quoteFilter);
      setQuotes(Array.isArray(data) ? data : data.quotes || data.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    if (tab === 'overview') loadStats();
    if (tab === 'orders') loadOrders();
    if (tab === 'quotes') loadQuotes();
    if (tab === 'coupons') loadCoupons();
    if (tab === 'messages') loadMessages();
    if (tab === 'reviews') loadModReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tab]);

  useEffect(() => {
    if (token && tab === 'orders') loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderFilter]);

  useEffect(() => {
    if (token && tab === 'quotes') loadQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteFilter]);

  async function loadCoupons() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await listCoupons(token);
      setCoupons(Array.isArray(data) ? data : data.coupons || data.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function onCouponSave(e) {
    e.preventDefault();
    setError('');
    setCouponMsg('');
    try {
      const payload = {
        code: couponForm.code,
        pct_off: Number(couponForm.pct),
        max_discount_paise: couponForm.maxRs ? Math.round(Number(couponForm.maxRs) * 100) : 0,
        min_order_paise: couponForm.minRs ? Math.round(Number(couponForm.minRs) * 100) : 0,
        active: true
      };
      const r = await saveCoupon(token, payload);
      setCouponMsg(`Saved coupon ${r.coupon?.code || payload.code}.`);
      setCouponForm({ code: '', pct: '', maxRs: '', minRs: '' });
      await loadCoupons();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onCouponToggle(code, active) {
    setError('');
    try {
      await toggleCoupon(token, code, !active);
      await loadCoupons();
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadMessages() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await getAdminMessages(token, msgFilter);
      setMessages(Array.isArray(data) ? data : data.messages || data.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadModReviews() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await getAdminReviews(token, modVerified, 100);
      setModReviews(Array.isArray(data) ? data : data.reviews || data.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function onMessageStatus(id, status) {
    setError('');
    try {
      await updateMessageStatus(token, id, status);
      await loadMessages();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onReviewVerify(id, verified) {
    setError('');
    try {
      await setReviewVerified(token, id, verified);
      await loadModReviews();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onReviewDelete(id) {
    setError('');
    try {
      if (typeof window !== 'undefined' && !window.confirm('Delete this review permanently?')) return;
      await deleteReview(token, id);
      await loadModReviews();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onOrderAction(id, status) {
    setError('');
    try {
      await updateOrderStatus(token, id, status);
      await loadOrders();
      if (tab === 'overview') await loadStats();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onQuoteAction(id, status) {
    setError('');
    setConvertMsg('');
    try {
      await updateQuoteStatus(token, id, status);
      await loadQuotes();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onQuoteConvert(id, productSlug) {
    setError('');
    setConvertMsg('');
    try {
      const raw = typeof window !== 'undefined'
        ? window.prompt(`Agreed unit price in ₹ for ${productSlug || 'this item'} (leave blank for catalog price):`, '')
        : '';
      const paise = raw && raw.trim() ? Math.round(Number(raw.replace(/,/g, '')) * 100) : undefined;
      if (raw && raw.trim() && (!Number.isFinite(paise) || paise <= 0)) {
        setError('Enter a valid agreed price in ₹.');
        return;
      }
      const r = await convertQuote(token, id, paise);
      setConvertMsg(`Quote converted → order ${r.receipt}${r.reused ? ' (already existed)' : ''} — collect advance via Razorpay Payment Link, then mark shipped.`);
      await loadQuotes();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onStockUpdate(e) {
    e.preventDefault();
    setError('');
    setStockResult(null);
    try {
      const r = await updateStock(token, slug.trim(), Number(stock));
      setStockResult(r);
    } catch (err) {
      setError(err.message);
    }
  }

  function orderActions(o) {
    const st = String(o.status || '').toLowerCase();
    const id = o.id || o._id || o.receipt;
    const btns = [];
    if (st === 'paid' || st === 'cod' || st === 'pending') {
      btns.push(['shipped', 'Ship']);
    }
    if (st === 'shipped') {
      btns.push(['delivered', 'Deliver']);
    }
    if (st !== 'cancelled' && st !== 'refunded' && st !== 'delivered') {
      btns.push(['cancelled', 'Cancel']);
    }
    if ((st === 'paid' || st === 'shipped') ) {
      btns.push(['refunded', 'Refund']);
    }
    return btns.map(([s, label]) => (
      <button key={s} onClick={() => onOrderAction(id, s)} className="btn-outline !py-1 !px-2 text-xs mr-1 mb-1">
        {label}
      </button>
    ));
  }

  const statsOrdersByStatus = stats?.ordersByStatus || stats?.orders_by_status || stats?.byStatus || null;
  const lowStock = stats?.lowStock || stats?.low_stock || stats?.lowStockProducts || [];
  const newQuotesCount = stats?.newQuotes ?? stats?.new_quotes ?? stats?.quotesNew ?? null;
  const revenue = stats?.revenue ?? stats?.revenuePaise ?? stats?.revenue_paise ?? stats?.totalRevenue ?? null;

  const tabs = [
    ['overview', 'Overview'],
    ['orders', 'Orders'],
    ['quotes', 'Quotes'],
    ['coupons', 'Coupons'],
    ['messages', 'Messages'],
    ['reviews', 'Reviews'],
    ['stock', 'Stock']
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold">Admin Console</h1>
      <p className="text-sm text-gray-500 mt-1">Manage orders, quotes and stock. Token is sent as <code>x-admin-token</code>.</p>

      <div className="card p-4 mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Admin password / token"
          className="input flex-1"
        />
        <div className="flex gap-2">
          <button onClick={saveToken} className="btn-primary">Save &amp; Connect</button>
          {token ? <button onClick={clearToken} className="btn-outline">Clear</button> : null}
        </div>
      </div>

      {!token ? (
        <p className="text-sm text-gray-500 mt-4">Enter the admin token to continue. It is stored only in this tab (sessionStorage as <code>tk_admin</code>).</p>
      ) : (
        <>
          <div className="flex gap-2 mt-6 flex-wrap">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={tab === key ? 'btn-primary !py-2' : 'btn-outline !py-2'}
              >
                {label}
              </button>
            ))}
            <button onClick={() => { if (tab === 'overview') loadStats(); if (tab === 'orders') loadOrders(); if (tab === 'quotes') loadQuotes(); if (tab === 'coupons') loadCoupons(); if (tab === 'messages') loadMessages(); if (tab === 'reviews') loadModReviews(); }} className="btn-outline !py-2 ml-auto">
              Refresh
            </button>
          </div>

          {error ? <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div> : null}
          {loading ? <div className="mt-4 text-sm text-gray-500">Loading…</div> : null}

          {tab === 'overview' && (
            <div className="mt-4">
              {!stats ? (
                <p className="text-sm text-gray-500">No stats yet. Click Refresh.</p>
              ) : (
                <>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="card p-4">
                      <div className="text-xs text-gray-500 font-semibold uppercase">Revenue</div>
                      <div className="text-2xl font-extrabold mt-1">{revenue != null ? inrMaybe(revenue) : '—'}</div>
                    </div>
                    <div className="card p-4">
                      <div className="text-xs text-gray-500 font-semibold uppercase">Total orders</div>
                      <div className="text-2xl font-extrabold mt-1">{stats.totalOrders ?? stats.total_orders ?? stats.ordersTotal ?? '—'}</div>
                    </div>
                    <div className="card p-4">
                      <div className="text-xs text-gray-500 font-semibold uppercase">New quotes</div>
                      <div className="text-2xl font-extrabold mt-1">{newQuotesCount ?? stats.totalQuotes ?? stats.quotes ?? '—'}</div>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 mt-3">
                    <div className="card p-4">
                      <div className="font-bold mb-2">Orders by status</div>
                      {statsOrdersByStatus ? (
                        <ul className="text-sm space-y-1">
                          {Object.entries(statsOrdersByStatus).map(([k, v]) => (
                            <li key={k} className="flex justify-between border-b py-1 last:border-0">
                              <span className="text-gray-600">{k}</span><b>{String(v)}</b>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500">status breakdown: {stats.ordersByStatus ? '' : JSON.stringify(stats).slice(0, 300)}</p>
                      )}
                    </div>
                    <div className="card p-4">
                      <div className="font-bold mb-2">Low stock</div>
                      {Array.isArray(lowStock) && lowStock.length > 0 ? (
                        <ul className="text-sm space-y-1">
                          {lowStock.map((p, i) => (
                            <li key={i} className="flex justify-between border-b py-1 last:border-0">
                              <span>{p.slug || p.name || JSON.stringify(p)}</span>
                              <b>{p.stock ?? p.qty ?? ''}</b>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500">No low-stock items reported.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'orders' && (
            <div className="mt-4">
              <div className="flex gap-2 items-center mb-3 flex-wrap">
                <label className="text-sm font-semibold">Status:</label>
                <select value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)} className="input !w-auto">
                  <option value="">All</option>
                  {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="text-xs text-gray-500">{orders.length} order(s)</span>
              </div>
              <div className="overflow-x-auto card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="p-2">Receipt</th>
                      <th className="p-2">Amount</th>
                      <th className="p-2">Customer</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o, i) => (
                      <tr key={o.id || o._id || o.receipt || i} className="border-b last:border-0">
                        <td className="p-2 font-mono text-xs">{o.receipt || o.id || o._id}</td>
                        <td className="p-2">{o.amount_paise != null ? inrFromPaise(o.amount_paise) : (o.amount != null ? inrMaybe(o.amount) : '—')}</td>
                        <td className="p-2 text-xs">{o.customer?.name || o.name || o.email || o.phone || '—'}</td>
                        <td className="p-2"><span className="badge bg-gray-100">{o.status || '—'}</span></td>
                        <td className="p-2">{orderActions(o)}</td>
                      </tr>
                    ))}
                    {orders.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-gray-500">No orders.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'quotes' && (
            <div className="mt-4">
              <div className="flex gap-2 items-center mb-3 flex-wrap">
                <label className="text-sm font-semibold">Status:</label>
                <select value={quoteFilter} onChange={(e) => setQuoteFilter(e.target.value)} className="input !w-auto">
                  <option value="">All</option>
                  {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="text-xs text-gray-500">{quotes.length} quote(s)</span>
              </div>
              {convertMsg ? (
                <div className="mb-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm text-green-800">{convertMsg}</div>
              ) : null}
              <div className="overflow-x-auto card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="p-2">ID</th>
                      <th className="p-2">Name / Contact</th>
                      <th className="p-2">Details</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q, i) => (
                      <tr key={q.id || q._id || i} className="border-b last:border-0">
                        <td className="p-2 font-mono text-xs">{q.id || q._id || '—'}</td>
                        <td className="p-2 text-xs">{q.name || q.customer || '—'}<br />{q.phone || q.email || ''}</td>
                        <td className="p-2 text-xs">
                          {(q.product_slug || q.product) ? <div className="font-mono">{q.product_slug || q.product}{q.qty ? ` × ${q.qty}` : ''}</div> : null}
                          <div>{q.message || q.details || '—'}</div>
                        </td>
                        <td className="p-2"><span className="badge bg-gray-100">{q.status || '—'}</span></td>
                        <td className="p-2">
                          {['contacted', 'quoted', 'won', 'lost'].map((s) => (
                            <button key={s} onClick={() => onQuoteAction(q.id || q._id, s)} className="btn-outline !py-1 !px-2 text-xs mr-1 mb-1">{s}</button>
                          ))}
                          {!q.order_receipt && (q.product_slug || q.product) ? (
                            <button onClick={() => onQuoteConvert(q.id || q._id, q.product_slug || q.product)} className="btn-primary !py-1 !px-2 text-xs mr-1 mb-1">Convert to order</button>
                          ) : null}
                          {q.order_receipt ? (
                            <span className="text-xs text-green-700">Order {q.order_receipt}</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {quotes.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-gray-500">No quotes.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'coupons' && (
            <div className="mt-4">
              <div className="card p-4 max-w-2xl">
                <div className="font-bold mb-2">Create / update coupon (code saved UPPERCASE)</div>
                <form onSubmit={onCouponSave} className="grid sm:grid-cols-4 gap-2">
                  <input value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })} placeholder="CODE e.g. DIWALI10" className="input uppercase" />
                  <input value={couponForm.pct} onChange={(e) => setCouponForm({ ...couponForm, pct: e.target.value })} placeholder="% off 1-90" type="number" min="1" max="90" className="input" />
                  <input value={couponForm.maxRs} onChange={(e) => setCouponForm({ ...couponForm, maxRs: e.target.value })} placeholder="Max discount ₹ (blank=none)" type="number" min="0" className="input" />
                  <input value={couponForm.minRs} onChange={(e) => setCouponForm({ ...couponForm, minRs: e.target.value })} placeholder="Min order ₹ (blank=none)" type="number" min="0" className="input" />
                </form>
                <button onClick={onCouponSave} className="btn-primary mt-3">Save coupon</button>
                {couponMsg ? <p className="text-sm text-green-700 font-semibold mt-2">{couponMsg}</p> : null}
              </div>
              <div className="overflow-x-auto card mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="p-2">Code</th>
                      <th className="p-2">% Off</th>
                      <th className="p-2">Max discount</th>
                      <th className="p-2">Min order</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map((c, i) => (
                      <tr key={c.code || i} className="border-b last:border-0">
                        <td className="p-2 font-mono font-bold">{c.code}</td>
                        <td className="p-2">{c.pct_off}%</td>
                        <td className="p-2">{c.max_discount_paise ? `₹${(Number(c.max_discount_paise) / 100).toLocaleString('en-IN')}` : '—'}</td>
                        <td className="p-2">{c.min_order_paise ? `₹${(Number(c.min_order_paise) / 100).toLocaleString('en-IN')}` : '—'}</td>
                        <td className="p-2"><span className="badge bg-gray-100">{c.active ? 'active' : 'off'}</span></td>
                        <td className="p-2">
                          <button onClick={() => onCouponToggle(c.code, c.active)} className="btn-outline !py-1 !px-2 text-xs">{c.active ? 'Disable' : 'Enable'}</button>
                        </td>
                      </tr>
                    ))}
                    {coupons.length === 0 ? <tr><td colSpan={6} className="p-4 text-center text-gray-500">No coupons. Seed provides WELCOME10 + TOOLS15.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'messages' && (
            <div className="mt-4">
              <div className="flex gap-2 items-center mb-3 flex-wrap">
                <label className="text-sm font-semibold">Status:</label>
                <select value={msgFilter} onChange={(e) => setMsgFilter(e.target.value)} className="input !w-auto">
                  <option value="">All</option>
                  {['new', 'contacted', 'closed'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="text-xs text-gray-500">{messages.length} message(s)</span>
              </div>
              <div className="overflow-x-auto card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="p-2">ID</th>
                      <th className="p-2">Name / Phone</th>
                      <th className="p-2">Message</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map((m, i) => (
                      <tr key={m.id || i} className="border-b last:border-0">
                        <td className="p-2 font-mono text-xs">{m.id || '—'}</td>
                        <td className="p-2 text-xs">{m.name || '—'}<br />{m.phone || ''}</td>
                        <td className="p-2 text-xs">{m.message || '—'}</td>
                        <td className="p-2"><span className="badge bg-gray-100">{m.status || '—'}</span></td>
                        <td className="p-2">
                          {['contacted', 'closed'].map((s) => (
                            <button key={s} onClick={() => onMessageStatus(m.id, s)} className="btn-outline !py-1 !px-2 text-xs mr-1 mb-1">{s}</button>
                          ))}
                        </td>
                      </tr>
                    ))}
                    {messages.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-gray-500">No messages.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'reviews' && (
            <div className="mt-4">
              <div className="flex gap-2 items-center mb-3 flex-wrap">
                <label className="text-sm font-semibold">Show:</label>
                <select value={modVerified} onChange={(e) => setModVerified(e.target.value)} className="input !w-auto">
                  <option value="">All</option>
                  <option value="false">Unverified (queue)</option>
                  <option value="true">Verified</option>
                </select>
                <span className="text-xs text-gray-500">{modReviews.length} review(s)</span>
              </div>
              <div className="overflow-x-auto card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="p-2">ID</th>
                      <th className="p-2">Product / By</th>
                      <th className="p-2">Rating + Review</th>
                      <th className="p-2">Verified</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modReviews.map((r, i) => (
                      <tr key={r.id || i} className="border-b last:border-0">
                        <td className="p-2 font-mono text-xs">{r.id || '—'}</td>
                        <td className="p-2 text-xs">{r.product_slug || ''}<br />{r.name || '—'}</td>
                        <td className="p-2 text-xs">★{r.rating} <b>{r.title || ''}</b><br />{r.body || ''}</td>
                        <td className="p-2"><span className="badge bg-gray-100">{r.verified ? 'yes' : 'no'}</span></td>
                        <td className="p-2">
                          <button onClick={() => onReviewVerify(r.id, !r.verified)} className="btn-outline !py-1 !px-2 text-xs mr-1 mb-1">{r.verified ? 'Unverify' : 'Verify'}</button>
                          <button onClick={() => onReviewDelete(r.id)} className="btn-outline !py-1 !px-2 text-xs mr-1 mb-1 !text-red-600">Delete</button>
                        </td>
                      </tr>
                    ))}
                    {modReviews.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-gray-500">Queue clear.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'stock' && (
            <div className="mt-4 card p-4 max-w-lg">
              <div className="font-bold mb-2">Update stock</div>
              <form onSubmit={onStockUpdate} className="space-y-2">
                <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Product slug" className="input" />
                <input value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Stock qty" type="number" className="input" />
                <button type="submit" className="btn-primary">Update stock</button>
              </form>
              {stockResult ? <pre className="mt-3 text-xs bg-gray-50 border rounded-lg p-3 overflow-x-auto">{JSON.stringify(stockResult, null, 2)}</pre> : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
