'use client';

import { useEffect, useState } from 'react';
import { getAdminOrderDetail } from '../../../lib/api';
import { aggregatePicking } from '../../../lib/picking';
import { getAdminToken } from '../../../lib/adminToken';

// Printable consolidated picking list for the orders selected in the admin console.
// One row per SKU with the total quantity, which is what the person with the trolley needs.
export default function PickingListPage() {
  const [token, setToken] = useState('');
  const [ids, setIds] = useState([]);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('ids') || '';
    const parsed = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
    setIds(parsed);
    setToken(getAdminToken());
  }, []);

  useEffect(() => {
    if (!token || !ids.length) { setLoading(false); return undefined; }
    let alive = true;
    (async () => {
      try {
        const results = await Promise.all(ids.map((id) => getAdminOrderDetail(token, id).catch(() => null)));
        if (!alive) return;
        setOrders(results.map((r) => (r && (r.order || r))).filter(Boolean));
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [token, ids]);

  const { orderCount, rows, totalUnits } = aggregatePicking(orders);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Picking list</h1>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="btn-primary !py-2">Print</button>
          <a href="/admin" className="btn-outline !py-2">Back to admin</a>
        </div>
      </div>

      {!token ? (
        <p className="mt-6 text-red-600 font-semibold">Admin token missing, open the admin console first, then retry.</p>
      ) : null}
      {error ? <p role="alert" className="mt-4 text-red-600 font-semibold">{error}</p> : null}
      {loading ? <p className="mt-6 text-gray-500">Loading orders…</p> : null}

      {!loading && token ? (
        <div className="mt-5">
          <p className="text-sm text-gray-600">
            {orderCount} order{orderCount === 1 ? '' : 's'} • {rows.length} line{rows.length === 1 ? '' : 's'} • {totalUnits} unit{totalUnits === 1 ? '' : 's'}
          </p>
          {rows.length === 0 ? (
            <p className="mt-4 text-gray-600">Nothing to pick, the selected orders have no line items.</p>
          ) : (
            <table className="w-full text-sm mt-3">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2">Item</th>
                  <th className="py-2">HSN</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right no-print">Picked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.slug} className="border-b last:border-0">
                    <td className="py-2">{r.name}</td>
                    <td className="py-2 font-mono text-xs">{r.hsn || 'N/A'}</td>
                    <td className="py-2 text-right font-bold">{r.qty}</td>
                    <td className="py-2 text-right no-print">☐</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}
