'use client';

import { useEffect } from 'react';

// Route-level error boundary: a thrown error in a page must not leave the shopper on
// Next's bare "Application error" screen with no way back.
export default function Error({ error, reset }) {
  useEffect(() => {
    // Surfaced in the browser console for support; the server log has the request id.
    console.error('[storefront] page error:', error && error.message);
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="text-5xl">⚠️</div>
      <h1 className="text-2xl font-extrabold mt-3">Something went wrong</h1>
      <p className="text-gray-600 mt-2">
        This page failed to load. Your cart is safe — try again, and if it keeps happening message us on WhatsApp.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button onClick={() => reset()} className="btn-primary">Try again</button>
        <a href="/" className="btn-outline">Go to homepage</a>
        <a href="/category/all" className="btn-outline">Browse products</a>
      </div>
    </div>
  );
}
