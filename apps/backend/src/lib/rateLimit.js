// Minimal in-memory rate limiter for public write endpoints.
// Deliberately dependency-free: a single VPS doesn't need Redis for this, and the
// goal is stopping naive abuse (form spam, order-flooding), not DDoS mitigation.
function createRateLimiter({ windowMs = 60000, max = 30, message = 'Too many requests, please slow down.' } = {}) {
  const hits = new Map(); // key -> { count, resetAt }
  let lastSweep = Date.now();

  function sweep(now) {
    // Occasionally drop expired entries so the map cannot grow unbounded.
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }

  const middleware = function rateLimiter(req, res, next) {
    const now = Date.now();
    sweep(now);
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message, retryAfter });
    }
    next();
  };

  middleware.reset = () => hits.clear();
  middleware.hits = hits;
  return middleware;
}

module.exports = { createRateLimiter };
