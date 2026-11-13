require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const productsRouter = require('./routes/products');
const checkoutRouter = require('./routes/checkout');
const webhooksRouter = require('./routes/webhooks');
const quotesRouter = require('./routes/quotes');
const adminRouter = require('./routes/admin');
const searchRouter = require('./routes/search');
const engagementRouter = require('./routes/engagement');
const serviceRouter = require('./routes/service');
const invoiceRouter = require('./routes/invoice');
const authRouter = require('./routes/auth');
const brandsRouter = require('./routes/brands');
const categoriesRouter = require('./routes/categories');
const statesRouter = require('./routes/states');
const dealsRouter = require('./routes/deals');
const sitemapHandler = require('./routes/sitemap');
const db = require('./db');
const { makeReadyHandler } = require('./lib/health');
const { createRateLimiter } = require('./lib/rateLimit');
const { sweepStaleHolds, sweepIntervalMinutes } = require('./lib/sweep');
const { securityHeaders, corsOrigin } = require('./lib/security');
const { requestId } = require('./lib/requestId');
const { createShutdown } = require('./lib/shutdown');
const { seedOnBoot } = require('./lib/firstRunSeed');
const { configWarnings } = require('./lib/configCheck');
const { flushNotifications } = require('./lib/notify');

const app = express();
const PORT = process.env.PORT || 9000;

app.disable('x-powered-by');
// Trust exactly the configured number of proxy hops. `true` trusted every hop, so an
// attacker could rotate X-Forwarded-For and bypass every per-IP rate limit. Composer/nginx
// deploys set TRUST_PROXY=1 and nginx overwrites the header with the real client address.
const trustProxy = process.env.TRUST_PROXY;
app.set(
  'trust proxy',
  trustProxy === undefined || trustProxy === '' || trustProxy === 'false'
    ? false
    : trustProxy === 'true'
      ? true
      : /^\d+$/.test(trustProxy)
        ? Number(trustProxy)
        : trustProxy
);

const allowedOrigins = corsOrigin(process.env);
app.use(securityHeaders);
app.use(requestId);
// No wildcard in production: the single-domain deployment needs no CORS at all, and "*"
// would let any website call the API from a browser.
app.use(cors({ origin: allowedOrigins }));

// Webhooks need the RAW body for signature verification -> mount before express.json
app.use('/webhooks', express.raw({ type: '*/*' }), webhooksRouter);

app.use(express.json({ limit: '1mb' }));

// Ensure ./public/images exists; serve placeholder images
const imagesDir = path.join(__dirname, '..', 'public', 'images');
fs.mkdirSync(imagesDir, { recursive: true });
app.use('/images', express.static(imagesDir));

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/ready', makeReadyHandler(db));

// Public write endpoints get a per-IP rate limit so form spam / order flooding can't
// tie up the box. Reads are unmetered (they're the SEO traffic we want).
const writeLimit = createRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: Number(process.env.RATE_LIMIT_MAX) || 30,
});
app.use(['/store/checkout/create', '/store/quotes', '/store/service'], writeLimit);
// Auth endpoints are the most attractive brute-force target: separate, tight budget.
const authLimit = createRateLimiter({
  windowMs: 60000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30,
  message: 'Too many sign-in attempts, please wait a minute.',
});
app.use('/store/auth', authLimit);
app.use('/store/engage', (req, res, next) => {
  if (req.method === 'GET') return next();
  return writeLimit(req, res, next);
});

// Admin endpoints take a token: throttle them so it can't be brute-forced.
const adminLimit = createRateLimiter({
  windowMs: Number(process.env.ADMIN_RATE_LIMIT_WINDOW_MS) || 60000,
  max: Number(process.env.ADMIN_RATE_LIMIT_MAX) || 120,
  message: 'Too many admin requests, slow down.',
});
app.use('/admin', adminLimit);

// Receipt-scoped reads (invoice/track/verify) expose customer details. Receipts are
// cryptographically random now, but a limiter still blocks brute-force enumeration.
const lookupLimit = createRateLimiter({
  windowMs: 60000,
  max: Number(process.env.LOOKUP_RATE_LIMIT_MAX) || 60,
  message: 'Too many lookups, please wait a moment.',
});
app.use(['/store/invoice', '/store/service/track', '/store/checkout/verify'], lookupLimit);

// Typeahead hits the database on every keystroke, so it needs its own (generous) budget:
// fast typing debounced at 250 ms stays well under it, while a scraper is cut off.
const suggestLimit = createRateLimiter({
  windowMs: 60000,
  max: Number(process.env.SUGGEST_RATE_LIMIT_MAX) || 120,
  message: 'Too many search requests, please slow down.',
});
app.use('/store/search/suggest', suggestLimit);

app.use('/store/products', productsRouter);
app.use('/store/brands', brandsRouter);
app.use('/store/categories', categoriesRouter);
app.use('/store/states', statesRouter);
app.use('/store/deals', dealsRouter);
app.use('/store/auth', authRouter);
app.use('/store/checkout', checkoutRouter);
app.use('/store/quotes', quotesRouter);
app.use('/store/search', searchRouter);
app.use('/admin', adminRouter);
app.use('/store/engage', engagementRouter);
app.use('/store/service', serviceRouter);
app.use('/store/invoice', invoiceRouter);

app.get('/sitemap.xml', sitemapHandler);

app.use((req, res) => res.status(404).json({ error: 'Not found', requestId: req.id || null }));

// JSON error responses (body-parser failures default to HTML otherwise).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // body-parser errors carry a `type` (entity.too.large, entity.parse.failed) and a status.
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'Request body too large', requestId: req.id || null });
  }
  const rid = req && req.id ? req.id : 'no-id';
  if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
    return res.status(400).json({ error: 'Invalid JSON body', requestId: rid });
  }
  console.error(`[backend] unhandled error [${rid}]:`, err && err.message);
  res.status(err && err.status === 404 ? 404 : 500).json({ error: 'Internal error', requestId: rid });
});

process.on('unhandledRejection', (err) => {
  console.error('[backend] unhandledRejection:', err && err.message);
});

let sweepTimer = null;
let notifyTimer = null;

const server = app.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`);
  console.log(`[backend] health: http://localhost:${PORT}/health`);
  console.log(`[backend] admin token ${process.env.ADMIN_TOKEN ? 'set' : 'NOT set (admin disabled)'}`);
  // One audit line per degraded production feature, so a misconfigured deploy is obvious
  // in `docker compose logs` instead of being discovered by a shopper.
  for (const warning of configWarnings(process.env)) console.warn(warning);

  // Fresh volume: create the schema, then load the catalogue so the store isn't empty until
  // someone remembers `npm run seed`. Only ever runs against an empty table.
  seedOnBoot(db).catch(() => { /* logged inside */ });

  // Abandoned checkouts hold stock with no webhook coming to release it, so sweep on a
  // timer. 0 disables it (the admin button still works); skipped under test.
  const sweepMinutes = sweepIntervalMinutes();
  if (process.env.NODE_ENV !== 'test' && sweepMinutes > 0) {
    const run = () => sweepStaleHolds(db, { minutes: sweepMinutes })
      .then(({ released }) => {
        if (released.length) console.log(`[sweep] released ${released.length} abandoned hold(s)`);
      })
      .catch((e) => console.error('[sweep] error:', e.message));
    sweepTimer = setInterval(run, sweepMinutes * 60 * 1000);
    if (sweepTimer.unref) sweepTimer.unref();
    console.log(`[backend] stale-hold sweep every ${sweepMinutes}m`);
  }

  // Deliver queued transactional email. Without SMTP configured messages are recorded as
  // `logged` in the admin console, which keeps local/CI runs deterministic.
  const notifySeconds = parseInt(process.env.NOTIFY_INTERVAL_SECONDS, 10);
  const interval = Number.isFinite(notifySeconds) && notifySeconds >= 0 ? notifySeconds : 30;
  if (process.env.NODE_ENV !== 'test' && interval > 0) {
    const flush = () => flushNotifications()
      .then((s2) => {
        if (s2.sent || s2.failed) console.log(`[notify] sent=${s2.sent} logged=${s2.logged} failed=${s2.failed}`);
      })
      .catch((e) => console.error('[notify] flush error:', e.message));
    notifyTimer = setInterval(flush, interval * 1000);
    if (notifyTimer.unref) notifyTimer.unref();
    flush();
    console.log(`[backend] email outbox flush every ${interval}s`);
  }
});

// Redeploys send SIGTERM: finish in-flight checkouts/webhooks before exiting instead of
// cutting them off mid-transaction, and drain the Postgres pool.
const shutdown = createShutdown({ server, pool: db.pool, interval: sweepTimer, intervals: [sweepTimer, notifyTimer].filter(Boolean), timeoutMs: Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000 });
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => { shutdown(signal); });
}
