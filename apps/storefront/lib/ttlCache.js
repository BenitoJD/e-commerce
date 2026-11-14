// Tiny TTL cache for server-side data fetches.
//
// Server-rendered pages must show fresh prices/stock, so they can't be statically
// generated, but a burst of traffic (a WhatsApp share going viral, a Google crawl)
// would otherwise hit Postgres once per request. A few seconds of caching collapses
// those bursts without showing stale data for long.
export function createTtlCache({ ttlMs = 15000, max = 200, now = () => Date.now() } = {}) {
  const store = new Map(); // key -> { value, expiresAt }

  function get(key) {
    const hit = store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= now()) {
      store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  function set(key, value) {
    if (store.size >= max && !store.has(key)) {
      // Simple eviction: drop the oldest insertion (Map preserves order).
      const oldest = store.keys().next();
      if (!oldest.done) store.delete(oldest.value);
    }
    store.set(key, { value, expiresAt: now() + ttlMs });
    return value;
  }

  async function wrap(key, fn) {
    const cached = get(key);
    if (cached !== undefined) return cached;
    const value = await fn();
    return set(key, value);
  }

  return { get, set, wrap, clear: () => store.clear(), size: () => store.size };
}
