'use client';

import { useEffect, useState } from 'react';
import {
  fetchProducts,
  getAdminStats,
  getAdminOrders,
  getAdminOrdersCsv,
  bulkUpdateOrderStatus,
  getAdminOrderDetail,
  updateOrderStatus,
  getAdminQuotes,
  updateQuoteStatus,
  convertQuote,
  listCoupons,
  saveCoupon,
  toggleCoupon,
  getAdminMessages,
  updateMessageStatus,
  getAdminReturns,
  updateReturnStatus,
  getAdminSubscribers,
  getAdminStockAlerts,
  saveAdminProduct,
  deleteAdminProduct,
  getAdminReviews,
  setReviewVerified,
  deleteReview,
  listAdminQuestions,
  deleteQuestion,
  answerQuestion,
  updateStock
} from '../../lib/api';
import { waLinkTo, STORE } from '../../lib/store';
import { reconcileOrder } from '../../lib/orderMath';

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

const ORDER_STATUSES = ['pending', 'paid', 'cod_pending', 'shipped', 'delivered', 'cancelled', 'refunded', 'failed'];
const QUOTE_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [input, setInput] = useState('');
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersHasMore, setOrdersHasMore] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const [orderFilter, setOrderFilter] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderDetail, setOrderDetail] = useState(null);
  const [orderFrom, setOrderFrom] = useState('');
  const [orderTo, setOrderTo] = useState('');
  const [quotes, setQuotes] = useState([]);
  const [quoteFilter, setQuoteFilter] = useState('');

  const [slug, setSlug] = useState('');
  const [stock, setStock] = useState('');
  const [stockResult, setStockResult] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [alertSlug, setAlertSlug] = useState('');

  async function loadStockAlerts(filterSlug = alertSlug) {
    setError('');
    try {
      const r = await getAdminStockAlerts(token, filterSlug);
      const rows = Array.isArray(r) ? r : r.alerts || r.items || [];
      setAlerts(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e.message);
    }
  }
  const [convertMsg, setConvertMsg] = useState('');

  const [coupons, setCoupons] = useState([]);
  const [couponForm, setCouponForm] = useState({ code: '', pct: '', maxRs: '', minRs: '', expires: '', maxUses: '' });
  const [couponMsg, setCouponMsg] = useState('');

  const [messages, setMessages] = useState([]);
  const [msgFilter, setMsgFilter] = useState('');
  const [subscribers, setSubscribers] = useState([]);
  const [modReviews, setModReviews] = useState([]);
  const [modVerified, setModVerified] = useState('false');
  const [modQuestions, setModQuestions] = useState([]);
  const [modAnswered, setModAnswered] = useState('false');
  const [returns, setReturns] = useState([]);
  const [returnFilter, setReturnFilter] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogHasMore, setCatalogHasMore] = useState(false);
  const [prodForm, setProdForm] = useState({ slug: '', name: '', brand: '', category: 'power-tools', priceRs: '', mrpRs: '', hsn: '', stock: '', images: '' });
  const [prodMsg, setProdMsg] = useState('');

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

  async function runBulkStatus(status) {
    if (!selectedOrders.length || bulkBusy) return;
    setBulkBusy(true);
    setBulkMsg('');
    try {
      const r = await bulkUpdateOrderStatus(token, selectedOrders, status);
      const applied = (r && r.applied) || [];
      const skipped = (r && r.skipped) || [];
      setBulkMsg(`${applied.length} order(s) marked ${status}${skipped.length ? `, ${skipped.length} skipped (${skipped[0].reason})` : ''}.`);
      setSelectedOrders([]);
      await loadOrders();
    } catch (e) {
      setBulkMsg(`Bulk update failed: ${e.message}`);
    } finally {
      setBulkBusy(false);
    }
  }

  async function loadOrders({ append = false } = {}) {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      // Older orders would otherwise be unreachable beyond the first page.
      const offset = append ? orders.length : 0;
      const data = await getAdminOrders(token, orderFilter, orderSearch.trim(), { from: orderFrom, to: orderTo, offset });
      const list = Array.isArray(data) ? data : data.orders || data.items || [];
      setOrders((prev) => (append ? [...prev, ...list] : list));
      setOrdersHasMore(list.length === 50);
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
    if (tab === 'returns') loadReturns();
    if (tab === 'products') loadCatalog();
    if (tab === 'stock') loadStockAlerts();
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
        expires_at: couponForm.expires ? new Date(couponForm.expires).toISOString() : null,
        max_uses: couponForm.maxUses ? Number(couponForm.maxUses) : null,
        active: true
      };
      const r = await saveCoupon(token, payload);
      setCouponMsg(`Saved coupon ${r.coupon?.code || payload.code}.`);
      setCouponForm({ code: '', pct: '', maxRs: '', minRs: '', expires: '', maxUses: '' });
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

  async function loadCatalog({ append = false, query = catalogQuery } = {}) {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      // Paged + searchable: a flat limit of 100 made products beyond that unreachable.
      const offset = append ? catalog.length : 0;
      const term = String(query || '').trim();
      const data = await fetchProducts({ limit: 100, offset, ...(term ? { search: term } : {}) });
      const list = Array.isArray(data) ? data : data.products || data.items || [];
      setCatalog((prev) => (append ? [...prev, ...list] : list));
      setCatalogHasMore(list.length === 100);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function onProductSave(e) {
    e.preventDefault();
    setError('');
    setProdMsg('');
    try {
      const pricePaise = Math.round(Number(prodForm.priceRs) * 100);
      const payload = {
        slug: prodForm.slug.trim().toLowerCase(),
        name: prodForm.name.trim(),
        brand: prodForm.brand.trim(),
        category: prodForm.category.trim() || 'power-tools',
        price_paise: pricePaise,
        mrp_paise: prodForm.mrpRs ? Math.round(Number(prodForm.mrpRs) * 100) : pricePaise,
        hsn: prodForm.hsn.trim(),
        stock: Number(prodForm.stock) || 0,
        images: prodForm.images.split(',').map((s) => s.trim()).filter(Boolean),
      };
      const r = await saveAdminProduct(token, payload);
      setProdMsg(`Saved ${r.product?.slug || payload.slug}.`);
      setProdForm({ slug: '', name: '', brand: '', category: 'power-tools', priceRs: '', mrpRs: '', hsn: '', stock: '', images: '' });
      await loadCatalog();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onProductDelete(slug) {
    setError('');
    try {
      if (typeof window !== 'undefined' && !window.confirm(`Delete product ${slug}? Orders keep their history.`)) return;
      await deleteAdminProduct(token, slug);
      await loadCatalog();
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadReturns() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await getAdminReturns(token, returnFilter);
      setReturns(Array.isArray(data) ? data : data.returns || data.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function onReturnStatus(id, status) {
    setError('');
    try {
      await updateReturnStatus(token, id, status);
      await loadReturns();
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadMessages() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [md, sd] = await Promise.all([
        getAdminMessages(token, msgFilter),
        getAdminSubscribers(token).catch(() => null),
      ]);
      setMessages(Array.isArray(md) ? md : md.messages || md.items || []);
      const subs = sd ? (sd.subscribers || sd.items || (Array.isArray(sd) ? sd : [])) : [];
      setSubscribers(Array.isArray(subs) ? subs : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function downloadSubscribersCsv() {
    if (!subscribers.length) return;
    const rows = [['email', 'subscribed_on'], ...subscribers.map((s) => [s.email, s.created_at || ''])];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'newsletter-subscribers.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadModReviews() {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [rd, qd] = await Promise.all([
        getAdminReviews(token, modVerified, 100),
        listAdminQuestions(token, modAnswered, 100),
      ]);
      setModReviews(Array.isArray(rd) ? rd : rd.reviews || rd.items || []);
      setModQuestions(Array.isArray(qd) ? qd : qd.questions || qd.items || []);
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

  async function onQuestionDelete(id) {
    setError('');
    try {
      if (typeof window !== 'undefined' && !window.confirm('Delete this question permanently?')) return;
      await deleteQuestion(token, id);
      await loadModReviews();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onQuestionAnswer(id, existing) {
    setError('');
    try {
      if (typeof window === 'undefined') return;
      const text = window.prompt('Answer to publish under this question:', existing || '');
      if (text == null) return;
      if (!text.trim()) { setError('Answer cannot be empty.'); return; }
      await answerQuestion(token, id, text.trim());
      await loadModReviews();
    } catch (e) {
      setError(e.message);
    }
  }

  async function onOrderDetail(id) {
    setError('');
    try {
      const r = await getAdminOrderDetail(token, id);
      setOrderDetail(r.order || r);
    } catch (e) {
      setError(e.message);
    }
  }

  async function downloadOrdersCsv() {
    setError('');
    try {
      const csv = await getAdminOrdersCsv(token, orderFilter, { from: orderFrom, to: orderTo });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = orderFilter ? `orders-${orderFilter}.csv` : 'orders.csv';
      a.click();
      URL.revokeObjectURL(url);
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
    if (st === 'paid' || st === 'cod_pending' || st === 'pending') {
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
    ['products', 'Products'],
    ['returns', 'Returns'],
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
          className="input flex-1" aria-label="Admin token" />
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
            <button onClick={() => { if (tab === 'overview') loadStats(); if (tab === 'orders') loadOrders(); if (tab === 'quotes') loadQuotes(); if (tab === 'coupons') loadCoupons(); if (tab === 'messages') loadMessages(); if (tab === 'reviews') loadModReviews(); if (tab === 'returns') loadReturns(); if (tab === 'products') loadCatalog(); }} className="btn-outline !py-2 ml-auto">
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

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                    <div className="card p-4">
                      <div className="text-xs text-gray-500 font-semibold uppercase">Orders today</div>
                      <div className="text-2xl font-extrabold mt-1">{stats.ordersToday ?? 0}</div>
                    </div>
                    <div className="card p-4">
                      <div className="text-xs text-gray-500 font-semibold uppercase">Revenue today</div>
                      <div className="text-2xl font-extrabold mt-1">{inrFromPaise(stats.revenueTodayPaise ?? 0)}</div>
                    </div>
                    <div className="card p-4">
                      <div className="text-xs text-gray-500 font-semibold uppercase">Last 7 days</div>
                      <div className="text-2xl font-extrabold mt-1">{inrFromPaise(stats.revenue7dPaise ?? 0)}</div>
                    </div>
                    <div className="card p-4">
                      <div className="text-xs text-gray-500 font-semibold uppercase">Needs action</div>
                      <div className="text-sm mt-1 space-y-0.5">
                        <div className="flex justify-between"><span className="text-gray-600">Unpaid / COD pending</span><b>{stats.pendingOrders ?? 0}</b></div>
                        <div className={`flex justify-between ${(stats.manualRefunds ?? 0) > 0 ? 'text-red-600 font-bold' : ''}`}>
                          <span>Manual refunds</span><b>{stats.manualRefunds ?? 0}</b>
                        </div>
                      </div>
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
                <input
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') loadOrders(); }}
                  placeholder="Search receipt / name / phone"
                  className="input !w-auto flex-1 min-w-[200px]" aria-label="Search orders by receipt, name or phone" />
                <input
                  type="date"
                  value={orderFrom}
                  onChange={(e) => setOrderFrom(e.target.value)}
                  className="input !w-auto"
                  aria-label="Orders from date"
                />
                <input
                  type="date"
                  value={orderTo}
                  onChange={(e) => setOrderTo(e.target.value)}
                  className="input !w-auto"
                  aria-label="Orders to date"
                />
                <button onClick={loadOrders} className="btn-outline !py-2">Search</button>
                <button onClick={downloadOrdersCsv} className="btn-outline !py-2" title="Accounting export">
                  Export CSV
                </button>
                <span className="text-xs text-gray-500">{orders.length} order(s)</span>
              </div>
              {selectedOrders.length > 0 ? (
                <div role="status" className="flex flex-wrap items-center gap-2 mt-3 p-2 bg-orange-50 border border-orange-200 rounded">
                  <b className="text-sm">{selectedOrders.length} selected</b>
                  <button onClick={() => runBulkStatus('shipped')} disabled={bulkBusy} className="btn-primary !py-1 !px-3 text-xs disabled:opacity-50">Mark shipped</button>
                  <button onClick={() => runBulkStatus('delivered')} disabled={bulkBusy} className="btn-primary !py-1 !px-3 text-xs disabled:opacity-50">Mark delivered</button>
                  <button onClick={() => runBulkStatus('cancelled')} disabled={bulkBusy} className="btn-outline !py-1 !px-3 text-xs !text-red-600 disabled:opacity-50">Cancel selected</button>
                  <button onClick={() => setSelectedOrders([])} className="text-xs underline">Clear selection</button>
                </div>
              ) : null}
              {bulkMsg ? <p role="status" className="text-sm font-semibold text-gray-700 mt-2">{bulkMsg}</p> : null}
              <div className="overflow-x-auto card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="p-2">
                        <input
                          type="checkbox"
                          aria-label="Select all orders on this page"
                          checked={orders.length > 0 && selectedOrders.length === orders.length}
                          onChange={(e) => setSelectedOrders(e.target.checked ? orders.map((o) => o.id) : [])}
                        />
                      </th>
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
                        <td className="p-2">
                          <input
                            type="checkbox"
                            aria-label={`Select order ${o.receipt || o.id}`}
                            checked={selectedOrders.includes(o.id)}
                            onChange={(e) => setSelectedOrders((prev) => (
                              e.target.checked ? [...prev, o.id] : prev.filter((x) => x !== o.id)
                            ))}
                          />
                        </td>
                        <td className="p-2 font-mono text-xs">{o.receipt || o.id || o._id}<br /><span className="text-gray-400">{o.created_at || o.createdAt ? new Date(o.created_at || o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}</span>{(o.razorpay_payment_id || o.razorpayPaymentId) ? <><br /><span className="text-gray-400" title="Razorpay payment ID">pay_{String(o.razorpay_payment_id || o.razorpayPaymentId).slice(-8)}</span></> : null}</td>
                        <td className="p-2">{o.amount_paise != null ? inrFromPaise(o.amount_paise) : (o.amount != null ? inrMaybe(o.amount) : '—')}{(o.coupon_code || o.couponCode) ? <div className="text-xs text-green-700 font-semibold">{o.coupon_code || o.couponCode}{o.discount_paise || o.discountPaise ? ` −₹${(Number(o.discount_paise ?? o.discountPaise) / 100).toLocaleString('en-IN')}` : ''}</div> : null}</td>
                        <td className="p-2 text-xs">{o.customer?.name || o.name || o.email || o.phone || '—'}</td>
                        <td className="p-2"><span className="badge bg-gray-100">{o.status || '—'}</span>
                          {o.refund_mode ? (
                            <div className={`text-[11px] font-bold mt-1 ${o.refund_mode === 'manual' ? 'text-red-600' : 'text-green-700'}`}>
                              refund: {o.refund_mode === 'manual' ? 'manual — action needed' : 'auto'}
                            </div>
                          ) : null}
                        </td>
                        <td className="p-2">
                          <button onClick={() => onOrderDetail(o.id)} className="btn-outline !py-1 !px-2 text-xs mr-1 mb-1">View</button>
                          {/* Operators need the GST invoice for support and filing — don't make them build the URL by hand. */}
                          <a
                            href={`/invoice/${encodeURIComponent(o.receipt || '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-outline !py-1 !px-2 text-xs mr-1 mb-1"
                          >
                            Invoice
                          </a>
                          {orderActions(o)}
                        </td>
                      </tr>
                    ))}
                    {orders.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-gray-500">No orders.</td></tr> : null}
                  </tbody>
                </table>
              </div>
              {ordersHasMore ? (
                <button onClick={() => loadOrders({ append: true })} disabled={loading} className="btn-outline !py-2 mt-3 disabled:opacity-50">
                  {loading ? 'Loading...' : 'Load more orders'}
                </button>
              ) : null}

              {orderDetail ? (
                <div className="card p-4 mt-4">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <b>Order {orderDetail.receipt}</b>
                      <span className="badge bg-gray-100 ml-2">{orderDetail.status}</span>
                      <div className="text-xs text-gray-500 mt-1">
                        {orderDetail.createdAt ? new Date(orderDetail.createdAt).toLocaleString('en-IN') : ''}
                        {orderDetail.couponCode ? ` • coupon ${orderDetail.couponCode} −₹${((orderDetail.discountPaise || 0) / 100).toLocaleString('en-IN')}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`/invoice/${encodeURIComponent(orderDetail.receipt || '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-outline !py-1 !px-2 text-xs"
                      >
                        Open GST invoice
                      </a>
                      <button onClick={() => setOrderDetail(null)} className="btn-outline !py-1 !px-2 text-xs">Close</button>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4 mt-3 text-sm">
                    <div>
                      <div className="font-bold mb-1">Ship to</div>
                      <div>{orderDetail.customer?.name || '—'}</div>
                      <div className="text-gray-600">{orderDetail.customer?.address || ''}</div>
                      <div className="text-gray-600">
                        {orderDetail.customer?.pincode ? `PIN ${orderDetail.customer.pincode} • ` : ''}
                        {orderDetail.customer?.phone || ''}
                      </div>
                    </div>
                    <div className="sm:text-right text-gray-600">
                      <div>Pay mode: <b className="text-gray-800">{orderDetail.payMode === 'cod' ? 'Cash on Delivery' : 'Online (Razorpay)'}</b></div>
                      {orderDetail.refundMode ? (
                        <div className={orderDetail.refundMode === 'manual' ? 'text-red-600 font-bold' : 'text-green-700'}>
                          Refund: {orderDetail.refundMode === 'manual' ? 'manual — not yet paid out' : 'auto (gateway)'}
                        </div>
                      ) : null}
                      <div>Razorpay order: <b className="text-gray-800">{orderDetail.razorpayOrderId || '—'}</b></div>
                      <div>Payment ID: <b className="text-gray-800">{orderDetail.razorpayPaymentId || '—'}</b></div>
                      {(() => {
                        // Explain the charge: items − discount + shipping must equal the total.
                        const m = reconcileOrder(orderDetail);
                        return (
                          <div className="mt-2 border-t pt-2">
                            <div className="flex justify-between gap-4"><span>Items</span><span>{inrFromPaise(m.subtotalPaise)}</span></div>
                            {m.discountPaise ? <div className="flex justify-between gap-4 text-green-700"><span>Coupon {orderDetail.couponCode || ''}</span><span>− {inrFromPaise(m.discountPaise)}</span></div> : null}
                            <div className="flex justify-between gap-4"><span>Shipping</span><span>{m.shippingPaise ? inrFromPaise(m.shippingPaise) : 'Free'}</span></div>
                            <div className="flex justify-between gap-4 font-bold border-t mt-1 pt-1"><span>Total charged</span><span>{inrFromPaise(m.totalPaise)}</span></div>
                            {!m.matches ? (
                              <div role="alert" className="text-red-600 font-bold mt-1">
                                Reconciles to {inrFromPaise(m.expectedPaise)} — differs by {inrFromPaise(Math.abs(m.differencePaise))}. Check the invoice before replying.
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <table className="w-full text-sm mt-4">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-2">Item</th>
                        <th className="py-2 pr-2">HSN</th>
                        <th className="py-2 pr-2 text-right">Qty</th>
                        <th className="py-2 text-right">Line</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(orderDetail.items || []).map((it, i) => (
                        <tr key={it.slug || i} className="border-b last:border-0">
                          <td className="py-2 pr-2">{it.name || it.slug}</td>
                          <td className="py-2 pr-2 text-gray-600">{it.hsn || '—'}</td>
                          <td className="py-2 pr-2 text-right">{it.qty}</td>
                          <td className="py-2 text-right">{inrFromPaise(it.linePaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
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
                          {q.product_name ? <div className="italic">“{q.product_name}”</div> : null}
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
                          {waLinkTo(q.phone, `Hello ${q.name || ''}, this is ${STORE.name} about your quote request for ${q.product_name || q.product_slug || 'your item'}.`) ? (
                            <a
                              href={waLinkTo(q.phone, `Hello ${q.name || ''}, this is ${STORE.name} about your quote request for ${q.product_name || q.product_slug || 'your item'}.`)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-outline !py-1 !px-2 text-xs !text-green-700 mr-1 mb-1"
                            >
                              WhatsApp
                            </a>
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
                  <input value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })} placeholder="CODE e.g. DIWALI10" className="input uppercase" aria-label="Coupon code" />
                  <input value={couponForm.pct} onChange={(e) => setCouponForm({ ...couponForm, pct: e.target.value })} placeholder="% off 1-90" type="number" min="1" max="90" className="input" aria-label="Discount percentage" />
                  <input value={couponForm.maxRs} onChange={(e) => setCouponForm({ ...couponForm, maxRs: e.target.value })} placeholder="Max discount ₹ (blank=none)" type="number" min="0" className="input" aria-label="Maximum discount in rupees" />
                  <input value={couponForm.minRs} onChange={(e) => setCouponForm({ ...couponForm, minRs: e.target.value })} placeholder="Min order ₹ (blank=none)" type="number" min="0" className="input" aria-label="Minimum order value in rupees" />
                  <input value={couponForm.expires} onChange={(e) => setCouponForm({ ...couponForm, expires: e.target.value })} type="date" className="input" title="Expiry date (blank = never)" aria-label="Coupon expiry date" />
                  <input value={couponForm.maxUses} onChange={(e) => setCouponForm({ ...couponForm, maxUses: e.target.value })} placeholder="Max uses (blank=unlimited)" type="number" min="1" className="input" aria-label="Maximum number of uses" />
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
                      <th className="p-2">Expires</th>
                      <th className="p-2">Uses</th>
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
                        <td className="p-2">{c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : 'never'}</td>
                        <td className="p-2">{Number(c.used_count) || 0}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                        <td className="p-2"><span className="badge bg-gray-100">{c.active ? 'active' : 'off'}</span></td>
                        <td className="p-2">
                          <button onClick={() => onCouponToggle(c.code, c.active)} className="btn-outline !py-1 !px-2 text-xs">{c.active ? 'Disable' : 'Enable'}</button>
                        </td>
                      </tr>
                    ))}
                    {coupons.length === 0 ? <tr><td colSpan={8} className="p-4 text-center text-gray-500">No coupons. Seed provides WELCOME10 + TOOLS15.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'products' && (
            <div className="mt-4">
              <div className="card p-4 max-w-3xl">
                <div className="font-bold mb-2">Add or update a product (same slug = update)</div>
                <form onSubmit={onProductSave} className="grid sm:grid-cols-2 gap-2">
                  <input value={prodForm.slug} onChange={(e) => setProdForm({ ...prodForm, slug: e.target.value })} placeholder="slug e.g. bosch-gsb-13-re-drill" className="input" aria-label="Product slug" />
                  <input value={prodForm.name} onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} placeholder="Product name" className="input" aria-label="Product name" />
                  <input value={prodForm.brand} onChange={(e) => setProdForm({ ...prodForm, brand: e.target.value })} placeholder="Brand" className="input" aria-label="Brand name" />
                  <input value={prodForm.category} onChange={(e) => setProdForm({ ...prodForm, category: e.target.value })} placeholder="Category (power-tools)" className="input" aria-label="Category slug" />
                  <input value={prodForm.priceRs} onChange={(e) => setProdForm({ ...prodForm, priceRs: e.target.value })} placeholder="Price ₹" type="number" min="1" className="input" aria-label="Selling price in rupees" />
                  <input value={prodForm.mrpRs} onChange={(e) => setProdForm({ ...prodForm, mrpRs: e.target.value })} placeholder="MRP ₹ (optional)" type="number" min="0" className="input" aria-label="MRP in rupees" />
                  <input value={prodForm.hsn} onChange={(e) => setProdForm({ ...prodForm, hsn: e.target.value })} placeholder="HSN code" className="input" aria-label="HSN code" />
                  <input value={prodForm.stock} onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })} placeholder="Stock qty" type="number" min="0" className="input" aria-label="Stock quantity" />
                  <input value={prodForm.images} onChange={(e) => setProdForm({ ...prodForm, images: e.target.value })} placeholder="Image paths, comma separated" className="input sm:col-span-2" aria-label="Image paths" />
                </form>
                <button onClick={onProductSave} className="btn-primary mt-3">Save product</button>
                {prodMsg ? <p className="text-sm text-green-700 font-semibold mt-2">{prodMsg}</p> : null}
              </div>

              <div className="flex flex-wrap gap-2 items-center mt-4">
                <input
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') loadCatalog({ query: e.target.value }); }}
                  placeholder="Search catalogue by name / brand / slug"
                  className="input !w-auto flex-1 min-w-[200px]" aria-label="Search catalogue" />
                <button onClick={() => loadCatalog({ query: catalogQuery })} className="btn-outline !py-2">Search</button>
                <span className="text-xs text-gray-500">{catalog.length} shown</span>
              </div>
              <div className="overflow-x-auto card mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="p-2">Slug</th>
                      <th className="p-2">Name</th>
                      <th className="p-2">Price</th>
                      <th className="p-2">Stock</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((p, i) => (
                      <tr key={p.slug || i} className="border-b last:border-0">
                        <td className="p-2 font-mono text-xs">{p.slug}</td>
                        <td className="p-2 text-xs">{p.name}</td>
                        <td className="p-2">₹{Number(p.price || 0).toLocaleString('en-IN')}</td>
                        <td className="p-2">{p.stock ?? '—'}</td>
                        <td className="p-2">
                          <button
                            onClick={() => setProdForm({
                              slug: p.slug, name: p.name, brand: p.brand || '', category: p.category || 'power-tools',
                              priceRs: String(p.price ?? ''), mrpRs: String(p.mrp ?? ''),
                              hsn: p.hsn || '', stock: String(p.stock ?? ''), images: (p.images || []).join(', '),
                            })}
                            className="btn-outline !py-1 !px-2 text-xs mr-1 mb-1"
                          >Edit</button>
                          <button onClick={() => onProductDelete(p.slug)} className="btn-outline !py-1 !px-2 text-xs !text-red-600">Delete</button>
                        </td>
                      </tr>
                    ))}
                    {catalog.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-gray-500">No products loaded.</td></tr> : null}
                  </tbody>
                </table>
              </div>
              {catalogHasMore ? (
                <button onClick={() => loadCatalog({ append: true })} disabled={loading} className="btn-outline !py-2 mt-3 disabled:opacity-50">
                  {loading ? 'Loading...' : 'Load more products'}
                </button>
              ) : null}
            </div>
          )}

          {tab === 'returns' && (
            <div className="mt-4">
              <div className="flex gap-2 items-center mb-3 flex-wrap">
                <label className="text-sm font-semibold">Status:</label>
                <select value={returnFilter} onChange={(e) => setReturnFilter(e.target.value)} className="input !w-auto">
                  <option value="">All</option>
                  {['requested', 'approved', 'rejected', 'picked_up', 'refunded', 'closed'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="text-xs text-gray-500">{returns.length} request(s)</span>
              </div>
              <div className="overflow-x-auto card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="p-2">ID</th>
                      <th className="p-2">Receipt / Phone</th>
                      <th className="p-2">Reason</th>
                      <th className="p-2">Details</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((r, i) => (
                      <tr key={r.id || i} className="border-b last:border-0">
                        <td className="p-2 font-mono text-xs">{r.id || '—'}</td>
                        <td className="p-2 text-xs">{r.receipt || '—'}<br />{r.phone || ''}</td>
                        <td className="p-2 text-xs">{r.reason || '—'}</td>
                        <td className="p-2 text-xs max-w-[240px]">{r.details || '—'}</td>
                        <td className="p-2"><span className="badge bg-gray-100">{r.status || '—'}</span></td>
                        <td className="p-2">
                          {['approved', 'rejected', 'picked_up', 'refunded', 'closed'].map((s) => (
                            <button key={s} onClick={() => onReturnStatus(r.id, s)} className="btn-outline !py-1 !px-2 text-xs mr-1 mb-1">{s}</button>
                          ))}
                          {waLinkTo(r.phone, `Hello, this is ${STORE.name} about your return for order ${r.receipt || ''}.`) ? (
                            <a
                              href={waLinkTo(r.phone, `Hello, this is ${STORE.name} about your return for order ${r.receipt || ''}.`)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-outline !py-1 !px-2 text-xs !text-green-700 mr-1 mb-1"
                            >
                              WhatsApp
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {returns.length === 0 ? <tr><td colSpan={6} className="p-4 text-center text-gray-500">No return requests.</td></tr> : null}
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
                          {waLinkTo(m.phone, `Hello ${m.name || ''}, this is ${STORE.name} support about your enquiry.`.trim()) ? (
                            <a
                              href={waLinkTo(m.phone, `Hello ${m.name || ''}, this is ${STORE.name} support about your enquiry.`)}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-outline !py-1 !px-2 text-xs !text-green-700 mr-1 mb-1"
                            >
                              WhatsApp
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {messages.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-gray-500">No messages.</td></tr> : null}
                  </tbody>
                </table>
              </div>

              <div className="card p-4 mt-4">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div>
                    <b>Newsletter subscribers</b>
                    <span className="text-xs text-gray-500 ml-2">{subscribers.length} email(s)</span>
                  </div>
                  <button onClick={downloadSubscribersCsv} disabled={!subscribers.length} className="btn-outline !py-1.5 disabled:opacity-50">
                    Download CSV
                  </button>
                </div>
                {subscribers.length ? (
                  <ul className="mt-3 text-xs text-gray-700 max-h-48 overflow-y-auto space-y-1">
                    {subscribers.slice(0, 100).map((s, i) => (
                      <li key={s.email || i} className="flex justify-between border-b last:border-0 py-0.5">
                        <span>{s.email}</span>
                        <span className="text-gray-400">{s.created_at ? new Date(s.created_at).toLocaleDateString('en-IN') : ''}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500 mt-2">No subscribers yet — the footer form feeds this list.</p>
                )}
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
              <div className="mt-4 flex gap-2 items-center flex-wrap">
                <label className="text-sm font-semibold">Questions:</label>
                <select value={modAnswered} onChange={(e) => { setModAnswered(e.target.value); }} className="input !w-auto">
                  <option value="">All</option>
                  <option value="false">Unanswered</option>
                  <option value="true">Answered</option>
                </select>
                <button onClick={loadModReviews} className="btn-outline !py-1 !px-2 text-xs">Reload</button>
                <span className="text-xs text-gray-500">{modQuestions.length} question(s) — reply via API (POST /store/engage/answers/:id with x-admin-token); delete spam here.</span>
              </div>
              <div className="overflow-x-auto card mt-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="p-2">ID</th>
                      <th className="p-2">Product / By</th>
                      <th className="p-2">Question</th>
                      <th className="p-2">Answer</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modQuestions.map((q, i) => (
                      <tr key={q.id || i} className="border-b last:border-0">
                        <td className="p-2 font-mono text-xs">{q.id || '—'}</td>
                        <td className="p-2 text-xs">{q.product_slug || ''}<br />{q.name || '—'}</td>
                        <td className="p-2 text-xs">{q.question || ''}</td>
                        <td className="p-2 text-xs">{q.answer ? <span className="text-green-700">Yes</span> : <span className="text-gray-400">No</span>}</td>
                        <td className="p-2">
                          <button onClick={() => onQuestionAnswer(q.id, q.answer)} className="btn-outline !py-1 !px-2 text-xs mr-1 mb-1">{q.answer ? 'Edit answer' : 'Answer'}</button>
                          <button onClick={() => onQuestionDelete(q.id)} className="btn-outline !py-1 !px-2 text-xs mr-1 mb-1 !text-red-600">Delete</button>
                        </td>
                      </tr>
                    ))}
                    {modQuestions.length === 0 ? <tr><td colSpan={5} className="p-4 text-center text-gray-500">No questions in this view.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'stock' && (
            <>
            <div className="mt-4 card p-4 max-w-lg">
              <div className="font-bold mb-2">Update stock</div>
              <form onSubmit={onStockUpdate} className="space-y-2">
                <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Product slug" className="input" aria-label="Product slug for stock update" />
                <input value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Stock qty" type="number" className="input" aria-label="Stock quantity" />
                <button type="submit" className="btn-primary">Update stock</button>
              </form>
              {stockResult ? <pre className="mt-3 text-xs bg-gray-50 border rounded-lg p-3 overflow-x-auto">{JSON.stringify(stockResult, null, 2)}</pre> : null}
            </div>

            <div className="card p-4 mt-4">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div>
                  <b>Back-in-stock requests</b>
                  <span className="text-xs text-gray-500 ml-2">{alerts.length} waiting</span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={alertSlug}
                    onChange={(e) => setAlertSlug(e.target.value)}
                    placeholder="Filter by slug"
                    className="input !w-auto" aria-label="Filter restock requests by product slug" />
                  <button onClick={() => loadStockAlerts()} className="btn-outline !py-2">Load</button>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Customers who tapped &quot;notify me&quot; while out of stock — message them once you restock.
              </p>
              {alerts.length ? (
                <ul className="mt-3 text-xs text-gray-700 max-h-64 overflow-y-auto divide-y">
                  {alerts.map((a, i) => (
                    <li key={`${a.product_slug || a.slug}-${a.email}-${i}`} className="py-1.5 flex flex-wrap justify-between gap-2">
                      <span className="font-mono">{a.product_slug || a.slug}</span>
                      <span>{a.email}</span>
                      <span className="text-gray-400">{a.created_at ? new Date(a.created_at).toLocaleDateString('en-IN') : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-500 mt-2">No pending restock requests.</p>
              )}
            </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
