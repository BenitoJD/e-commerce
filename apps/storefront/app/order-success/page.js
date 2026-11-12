'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { verifyOrder } from '../../lib/api';

function normStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'cod_pending' || s === 'cod') return 'cod';
  return s;
}

function statusBadge(status) {
  const s = normStatus(status);
  if (s === 'paid') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'cod') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (s === 'failed') return 'bg-red-100 text-red-800 border-red-200';
  if (s === 'cancelled' || s === 'refunded') return 'bg-gray-100 text-gray-700 border-gray-300';
  return 'bg-yellow-50 text-yellow-800 border-yellow-200';
}

function statusLabel(status, fallbackMode) {
  const s = normStatus(status);
  if (s === 'paid') return 'Paid';
  if (s === 'cod') return 'COD';
  if (s === 'failed') return 'Failed';
  if (s === 'pending') return 'Pending';
  if (s === 'cancelled') return 'Cancelled';
  if (s === 'refunded') return 'Refunded';
  if (s === 'shipped') return 'Shipped';
  if (s === 'delivered') return 'Delivered';
  return fallbackMode || 'Pending';
}

const TERMINAL = new Set(['paid', 'cod', 'failed', 'cancelled', 'refunded']);

function SuccessInner() {
  const sp = useSearchParams();
  const receipt = sp.get('receipt') || '—';
  const mode = sp.get('mode') || 'Paid';
  const [verify, setVerify] = useState(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!receipt || receipt === '—') return;
    let cancelled = false;
    let count = 0;
    let timer = null;
    async function poll() {
      try {
        const data = await verifyOrder(receipt);
        if (cancelled) return;
        setVerify(data);
        const st = normStatus(data?.status);
        // stop early on terminal states
        if (TERMINAL.has(st)) return;
      } catch {
        // ignore transient errors, keep polling
      }
      count += 1;
      setAttempts(count);
      if (count < 10 && !cancelled) {
        timer = setTimeout(poll, 3000);
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [receipt]);

  const liveStatus = verify?.status || null;
  const amountPaise = verify?.amount_paise ?? verify?.amountPaise ?? null;
  const amountText =
    amountPaise != null
      ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amountPaise) / 100)
      : null;

  return (
    <div className="max-w-xl mx-auto px-4 py-14 text-center">
      <div className="w-16 h-16 mx-auto rounded-full bg-green-100 grid place-items-center text-3xl">✓</div>
      <h1 className="text-3xl font-extrabold mt-4">Order placed!</h1>
      <p className="text-gray-600 mt-2">Thank you for shopping with ToolsKart. A GST invoice will be emailed to you.</p>
      <div className="card p-5 mt-6 text-left text-sm space-y-2">
        <div className="flex justify-between"><span className="text-gray-500">Receipt / Order ID</span><b>{receipt}</b></div>
        <div className="flex justify-between"><span className="text-gray-500">Payment mode</span><b>{mode}</b></div>
        <div className="flex justify-between items-center">
          <span className="text-gray-500">Live status</span>
          <span className={`badge border ${statusBadge(liveStatus)}`}>{statusLabel(liveStatus, mode)}{attempts > 0 && !liveStatus ? ` (retry ${attempts}/10)` : ''}</span>
        </div>
        {amountText ? (
          <div className="flex justify-between"><span className="text-gray-500">Amount</span><b>{amountText}</b></div>
        ) : null}
        <div className="flex justify-between"><span className="text-gray-500">Delivery</span><b>3–7 working days</b></div>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a href="/category/all" className="btn-outline">Continue Shopping</a>
        {receipt && receipt !== '—' ? (
          <a href={`/track-order?receipt=${encodeURIComponent(receipt)}`} className="btn-outline">Track Order</a>
        ) : null}
        {receipt && receipt !== '—' ? (
          <a href={`/invoice/${encodeURIComponent(receipt)}`} className="btn-outline">GST Invoice</a>
        ) : null}
        <a href="https://wa.me/919999999999?text=Hi%20ToolsKart%2C%20need%20help%20with%20my%20order" target="_blank" rel="noreferrer" className="btn-primary">WhatsApp Support</a>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-500">Loading...</div>}>
      <SuccessInner />
    </Suspense>
  );
}
