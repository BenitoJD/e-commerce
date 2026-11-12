// Resolves the API base for *server-side* calls (SSR, metadata, sitemap rewrites).
//
// Browser and server need different addresses in a container deployment:
//   browser -> NEXT_PUBLIC_BACKEND_URL   (often just "/api", same origin via nginx)
//   server  -> BACKEND_INTERNAL_URL      (e.g. http://backend:9000, resolvable in-network)
//
// A relative public value like "/api" is useless to Node's fetch, so it is ignored here.
// CommonJS on purpose: next.config.js requires it directly; the app imports it via
// lib/serverApiBase.js.
function serverApiBase(env) {
  const e = env || (typeof process !== 'undefined' ? process.env : {}) || {};
  const absolute = (v) => {
    const s = String(v || '').trim();
    return /^https?:\/\//i.test(s) ? s.replace(/\/+$/, '') : null;
  };
  return absolute(e.BACKEND_INTERNAL_URL) || absolute(e.NEXT_PUBLIC_BACKEND_URL) || 'http://localhost:9000';
}

module.exports = { serverApiBase };
