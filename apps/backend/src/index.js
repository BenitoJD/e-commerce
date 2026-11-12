require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const productsRouter = require('./routes/products');
const checkoutRouter = require('./routes/checkout');
const webhooksRouter = require('./routes/webhooks');
const quotesRouter = require('./routes/quotes');

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

app.use('/store/products', productsRouter);
app.use('/store/checkout', checkoutRouter);
app.use('/store/quotes', quotesRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`[backend] listening on :${PORT}`);
  console.log(`[backend] health: http://localhost:${PORT}/health`);
});
