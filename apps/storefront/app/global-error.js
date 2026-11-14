'use client';

import { useEffect, useState } from 'react';
import { isChunkLoadError, markChunkReload } from '../lib/chunkError';

// Root error boundary. This is the only one that can catch a failure in the root layout or
// during initial chunk loading, and it must render its own <html>/<body>.
export default function GlobalError({ error, reset }) {
  const [chunk] = useState(() => isChunkLoadError(error));

  useEffect(() => {
    console.error('[storefront] global error:', error && error.message);
    if (chunk) {
      // One automatic reload picks up the new deployment; the guard stops a reload loop.
      if (markChunkReload(typeof window !== 'undefined' ? window.sessionStorage : null)) {
        window.location.reload();
      }
    }
  }, [error, chunk]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <main style={{ maxWidth: 640, margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 44 }}>{chunk ? '↻' : '⚠️'}</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '12px 0' }}>
            {chunk ? 'A new version is available' : 'Something went wrong'}
          </h1>
          <p style={{ color: '#4B5563', margin: '0 0 20px' }}>
            {chunk
              ? 'The store was updated while this page was open. Reload to continue. Your cart is saved on this device.'
              : 'This page could not load. Your cart is safe; reload or go back to the homepage.'}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => window.location.reload()} style={{ background: '#A95F32', color: '#fff', border: 0, borderRadius: 8, padding: '12px 20px', fontWeight: 700, cursor: 'pointer' }}>Reload page</button>
            <button onClick={() => reset()} style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, padding: '12px 20px', fontWeight: 700, cursor: 'pointer' }}>Try again</button>
            <a href="/" style={{ border: '1px solid #D1D5DB', borderRadius: 8, padding: '12px 20px', fontWeight: 700, color: '#111827', textDecoration: 'none' }}>Homepage</a>
          </div>
        </main>
      </body>
    </html>
  );
}
