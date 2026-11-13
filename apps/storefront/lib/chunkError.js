// Detect a stale-deploy chunk failure.
//
// Next.js hashes JS chunks per build. If a tab is open while a new build is deployed (very
// common on a VPS), the old HTML asks for chunks that no longer exist and the router shows
// "Application error: a client-side exception has occurred". A single reload fetches the
// new HTML + chunks; a loop guard prevents reloading forever if the deploy itself is broken.
export const RELOAD_KEY = 'tw_chunk_reload_at';
export const RELOAD_WINDOW_MS = 30000;

export function isChunkLoadError(error) {
  const message = String((error && (error.message || error.toString())) || '');
  const name = String((error && error.name) || '');
  return /ChunkLoadError/i.test(name)
    || /Loading chunk [\w./-]+ failed/i.test(message)
    || /Failed to fetch dynamically imported module/i.test(message)
    || /Importing a module script failed/i.test(message)
    || /error #423/i.test(message)
    || /Loading CSS chunk [\w./-]+ failed/i.test(message);
}

export function markChunkReload(storage, now = Date.now(), windowMs = RELOAD_WINDOW_MS) {
  if (!storage) return false;
  try {
    const last = Number(storage.getItem(RELOAD_KEY) || 0);
    if (last && now - last < windowMs) return false;
    storage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}
