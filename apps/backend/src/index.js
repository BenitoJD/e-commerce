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
const sitemapHandler = require('./routes/sitemap');
const db = require('./db');
const { makeReadyHandler } = require('./lib/health');
const { createRateLimiter } = require('./lib/rateLimit');
const { parseOrigins, securityHeaders } = require('./lib/security');

const app = express();
const PORT = process.env.PORT || 9000;

app.disable('x-powered-by');
app.set('trust proxy', true); // behind nginx: needed for req.secure / req.ip

const allowedOrigins = parseOrigins(process.env.FRONTEND_URL);
app.use(securityHeaders);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : '*' }));

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

app.use('/store/products', productsRouter);
app.use('/store/checkout', checkoutRouter);
app.use('/store/quotes', quotesRouter);
app.use('/store/search', searchRouter);
app.use('/admin', adminRouter);
app.use('/store/engage', engagementRouter);
app.use('/store/service', serviceRouter);
app.use('/store/invoice', invoiceRouter);

app.get('/sitemap.xml', sitemapHandler);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// JSON error responses (body-parser failures default to HTML otherwise).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err.status === 400)) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error('[backend] unhandled error:', err && err.message);
  res.status(err && err.status === 404 ? 404 : 500).json({ error: 'Internal error' });
});

process.on('unhandledRejection', (err) => {
  console.error('[backend] unhandledRejection:', err && err.message);
});

app.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`);
  console.log(`[backend] health: http://localhost:${PORT}/health`);
  console.log(`[backend] admin token ${process.env.ADMIN_TOKEN ? 'set' : 'NOT set (admin disabled)'}`);
});
