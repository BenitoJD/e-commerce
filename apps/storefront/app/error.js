'use client';

import { useEffect, useState } from 'react';
import { isChunkLoadError, markChunkReload } from '../lib/chunkError';

// Route-level error boundary: a thrown error in a page must not leave the shopper on
// Next's bare "Application error" screen with no way back.
export default function Error({ error, reset }) {
  const [chunk] = useState(() => isChunkLoadError(error));

  useEffect(() => {
    // Surfaced in the browser console for support; the server log has the request id.
    console.error('[storefront] page error:', error && error.message);
    // A redeploy while a tab was open replaces hashed chunks; one reload picks up the new
    // build. markChunkReload stops a reload loop if the deployment is genuinely broken.
    if (chunk && markChunkReload(typeof window !== 'undefined' ? window.sessionStorage : null)) {
      window.location.reload();
    }
  }, [error, chunk]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="text-5xl">{chunk ? '↻' : '⚠️'}</div>
      <h1 className="text-2xl font-extrabold mt-3">{chunk ? 'A new version is available' : 'Something went wrong'}</h1>
      <p className="text-gray-600 mt-2">
        {chunk
          ? 'The store was updated while this page was open. Reload to continue. Your cart is saved on this device.'
          : 'This page failed to load. Your cart is safe. Try again, and if it keeps happening, message us on WhatsApp.'}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {chunk ? <button onClick={() => window.location.reload()} className="btn-primary">Reload page</button> : null}
        <button onClick={() => reset()} className="btn-primary">Try again</button>
        <a href="/" className="btn-outline">Go to homepage</a>
        <a href="/category/all" className="btn-outline">Browse products</a>
      </div>
    </div>
  );
}
