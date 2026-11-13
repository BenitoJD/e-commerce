'use client';

import { useEffect, useState } from 'react';
import { getInvoice } from '../../../lib/api';
import { STORE } from '../../../lib/store';

const inr = (paise) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(paise || 0) / 100);

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function InvoicePage({ params }) {
  const receipt = decodeURIComponent(params?.receipt || '');
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!receipt) { setErr('Missing receipt ID.'); return; }
    let alive = true;
    (async () => {
      try {
        const r = await getInvoice(receipt);
        if (alive) setInv(r.invoice || r);
      } catch (e2) {
        if (alive) setErr(e2.message || 'Invoice not found.');
      }
    })();
    return () => { alive = false; };
  }, [receipt]);

  const print = () => {
    if (typeof window !== 'undefined') window.print();
  };

  const items = Array.isArray(inv?.items) ? inv.items : [];
  const customer = inv?.customer || {};
  const rawPayMode = String(inv?.payMode ?? inv?.pay_mode ?? '').toLowerCase();
  const payMode = inv?.mode || inv?.paymentMode
    || (rawPayMode === 'cod' ? 'Cash on Delivery'
      : rawPayMode === 'online' ? 'Online (Razorpay)'
        : (String(inv?.status || '').toLowerCase() === 'cod_pending' ? 'Cash on Delivery'
          : (inv?.razorpayPaymentId || inv?.razorpay_payment_id) ? 'Online (Razorpay)' : '—'));
  const gstRate = inv?.gst?.rate ?? 18;
  const discountPaise = Number(inv?.discountPaise ?? inv?.discount_paise ?? 0) || 0;
  const couponCode = inv?.couponCode ?? inv?.coupon_code ?? null;
  const shippingPaise = Number(inv?.shippingPaise ?? inv?.shipping_paise ?? 0) || 0;
  const itemsTotalFallback = items.reduce((s, it) => s + (Number(it.linePaise ?? it.line_paise) || Number(it.qty || 0) * Number(it.unitPaise ?? it.unit_paise ?? 0)), 0);
  const itemsTotal = Number(inv?.itemsTotalPaise ?? inv?.items_total_paise ?? itemsTotalFallback) || 0;
  const base = inv?.gst?.base ?? Math.round(((inv?.grandPaise ?? inv?.grand_paise ?? 0) * 100) / (100 + Number(gstRate)));
  const gstAmt = inv?.gst?.gst ?? Math.round(Number(base) * (Number(gstRate) / 100));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Print rules now live in globals.css so the invoice and the picking list share one
          definition of what gets hidden on paper. */}

      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <h1 className="text-3xl font-extrabold">Tax Invoice</h1>
        <button onClick={print} className="btn-primary !py-2">Print / Save PDF</button>
      </div>

      {err && <p className="text-sm text-red-600 font-semibold mt-4">{err}</p>}
      {!err && !inv && <p className="text-sm text-gray-500 mt-4">Loading invoice...</p>}

      {inv && (
        <div className="card print-card p-6 mt-5 text-sm">
          <div className="flex flex-wrap justify-between gap-4 border-b pb-4">
            <div>
              <div className="font-extrabold text-lg">{STORE.name}</div>
              <div className="text-gray-600">GSTIN: {STORE.gstin}</div>
              <div className="text-gray-600">Plot 12, MIDC Industrial Area, Pune, Maharashtra 411026</div>
              <div className="text-gray-600">{STORE.email} • {STORE.phoneDisplay}</div>
            </div>
            <div className="text-right">
              <div><span className="text-gray-500">Receipt no:</span> <b>{inv.receipt || receipt}</b></div>
              <div><span className="text-gray-500">Date:</span> <b>{fmtDate(inv.createdAt || inv.created_at)}</b></div>
              <div className="mt-1"><span className="badge bg-green-100 text-green-800">{String(inv.status || 'paid').toUpperCase()}</span></div>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 border-b py-4">
            <div>
              <div className="font-bold mb-1">Billed To</div>
              <div className="font-semibold">{customer.name || '—'}</div>
              <div className="text-gray-600">{customer.address || ''}</div>
              <div className="text-gray-600">{customer.pincode || ''}</div>
              <div className="text-gray-600">Phone: {customer.phone || '—'}</div>
              {customer.gstin ? (
                <div className="text-gray-600 font-semibold">GSTIN: {customer.gstin}</div>
              ) : null}
            </div>
            <div className="sm:text-right">
              <div className="font-bold mb-1">Payment</div>
              <div className="text-gray-600">Payment ID: <b className="text-gray-800">{inv.razorpayPaymentId || inv.razorpay_payment_id || '—'}</b></div>
              <div className="text-gray-600">Mode: {payMode}</div>
            </div>
          </div>

          <table className="w-full mt-4 text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-2">Item</th>
                <th className="py-2 pr-2">HSN</th>
                <th className="py-2 pr-2 text-right">Qty</th>
                <th className="py-2 pr-2 text-right">Rate</th>
                <th className="py-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const line = it.linePaise ?? it.line_paise ?? Number(it.qty || 0) * Number(it.unitPaise ?? it.unit_paise ?? 0);
                const rate = it.unitPaise ?? it.unit_paise ?? 0;
                return (
                  <tr key={it.slug || i} className="border-b last:border-0">
                    <td className="py-2 pr-2 font-semibold">{it.name || it.slug}</td>
                    <td className="py-2 pr-2 text-gray-600">{it.hsn || '—'}</td>
                    <td className="py-2 pr-2 text-right">{it.qty ?? 1}</td>
                    <td className="py-2 pr-2 text-right">{inr(rate)}</td>
                    <td className="py-2 text-right font-semibold">{inr(line)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 ml-auto max-w-xs w-full space-y-1.5">
            {discountPaise > 0 || shippingPaise > 0 ? (
              <>
                <div className="flex justify-between"><span className="text-gray-500">Items total</span><b>{inr(itemsTotal)}</b></div>
                {discountPaise > 0 ? (
                  <div className="flex justify-between text-green-700"><span>Coupon {couponCode || ''}</span><b>−{inr(discountPaise)}</b></div>
                ) : null}
                {shippingPaise > 0 ? (
                  <div className="flex justify-between"><span className="text-gray-500">Shipping</span><b>{inr(shippingPaise)}</b></div>
                ) : null}
              </>
            ) : null}
            <div className="flex justify-between"><span className="text-gray-500">Subtotal (taxable base)</span><b>{inr(inv.subtotalPaise ?? inv.subtotal_paise ?? base)}</b></div>
            <div className="flex justify-between"><span className="text-gray-500">GST @ {gstRate}%</span><b>{inr(gstAmt)}</b></div>
            <div className="flex justify-between text-base border-t pt-2"><span>Grand total</span><b>{inr(inv.grandPaise ?? inv.grand_paise ?? (Number(base) + Number(gstAmt)))}</b></div>
          </div>

          <p className="text-xs text-gray-500 mt-6">18% GST invoice — eligible for input tax credit on business purchases. For help contact {STORE.email} with your receipt number.</p>
        </div>
      )}
    </div>
  );
}
