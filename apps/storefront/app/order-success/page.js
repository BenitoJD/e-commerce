'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function SuccessInner() {
  const sp = useSearchParams();
  const receipt = sp.get('receipt') || '—';
  const mode = sp.get('mode') || 'Paid';
  return (
    <div className="max-w-xl mx-auto px-4 py-14 text-center">
      <div className="w-16 h-16 mx-auto rounded-full bg-green-100 grid place-items-center text-3xl">✓</div>
      <h1 className="text-3xl font-extrabold mt-4">Order placed!</h1>
      <p className="text-gray-600 mt-2">Thank you for shopping with ToolsKart. A GST invoice will be emailed to you.</p>
      <div className="card p-5 mt-6 text-left text-sm space-y-2">
        <div className="flex justify-between"><span className="text-gray-500">Receipt / Order ID</span><b>{receipt}</b></div>
        <div className="flex justify-between"><span className="text-gray-500">Payment mode</span><b>{mode}</b></div>
        <div className="flex justify-between"><span className="text-gray-500">Delivery</span><b>3–7 working days</b></div>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a href="/category/all" className="btn-outline">Continue Shopping</a>
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
