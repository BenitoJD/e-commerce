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

const app = express();
const PORT = process.env.PORT || 9000;

app.use(cors({ origin: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : '*' }));

// Webhooks need the RAW body for signature verification -> mount before express.json
app.use('/webhooks', express.raw({ type: '*/*' }), webhooksRouter);

app.use(express.json({ limit: '1mb' }));

// Ensure ./public/images exists; serve placeholder images
const imagesDir = path.join(__dirname, '..', 'public', 'images');
fs.mkdirSync(imagesDir, { recursive: true });
app.use('/images', express.static(imagesDir));

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/ready', makeReadyHandler(db));

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
