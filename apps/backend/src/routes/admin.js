const express = require('express');
const db = require('../db');
const { withTransaction, reserveItems, releaseItems } = require('../lib/stock');
const { shouldReleaseOnCancel, canTransition } = require('../lib/orderTransitions');
const { refundPayment } = require('../lib/refunds');

const router = express.Router();

const ORDER_STATUSES = ['paid', 'shipped', 'delivered', 'cancelled', 'refunded', 'cod_pending'];
const QUOTE_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

// Token auth: header x-admin-token must equal process.env.ADMIN_TOKEN
router.use((req, res, next) => {
  if (!process.env.ADMIN_TOKEN) {
    return res.status(503).json({ error: 'admin disabled' });
  }
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// GET /admin/stats
router.get('/stats', async (req, res) => {
  try {
    const { rows: statusRows } = await db.query(
      'SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status'
    );
    const ordersByStatus = {};
    for (const r of statusRows) ordersByStatus[r.status] = r.count;
    const totalOrders = Object.values(ordersByStatus).reduce((s, n) => s + n, 0);

    const { rows: revRows } = await db.query(
      `SELECT COALESCE(SUM(amount_paise), 0)::int AS total FROM orders WHERE status IN ('paid', 'delivered')`
    );
    const revenuePaise = revRows[0] ? revRows[0].total : 0;

    const { rows: lowStock } = await db.query(
      'SELECT slug, name, stock FROM products WHERE stock < 5 ORDER BY stock ASC'
    );

    const { rows: quoteRows } = await db.query(
      `SELECT COUNT(*)::int AS count FROM bulk_quotes WHERE status = 'new'`
    );
    const quotesNew = quoteRows[0] ? quoteRows[0].count : 0;

    res.json({ ordersByStatus, totalOrders, revenuePaise, lowStock, quotesNew });
  } catch (err) {
    console.error('[admin] stats error:', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// GET /admin/orders?status=&limit=50
router.get('/orders', async (req, res) => {
  try {
    let limit = parseInt(req.query.limit, 10) || 50;
    limit = Math.min(Math.max(limit, 1), 200);
    const { status, q } = req.query;
    const conds = [];
    const params = [];
    if (status) {
      params.push(status);
      conds.push(`status = $${params.length}`);
    }
    if (q) {
      params.push(`%${String(q).trim()}%`);
      const n = params.length;
      conds.push(`(receipt ILIKE $${n} OR customer->>'phone' ILIKE $${n} OR customer->>'name' ILIKE $${n})`);
    }
    params.push(limit);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT id, receipt, status, amount_paise, coupon_code, COALESCE(discount_paise, 0) AS discount_paise, customer, razorpay_payment_id, created_at
       FROM orders ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params
    );
    res.json({ orders: rows });
  } catch (err) {
    console.error('[admin] orders error:', err.message);
    res.status(500).json({ error: 'Failed to list orders' });
  }
});

// PATCH /admin/orders/:id {status}
router.patch('/orders/:id', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` });
    }
    const { rows: current } = await db.query('SELECT receipt, status, items, amount_paise, razorpay_payment_id FROM orders WHERE id = $1', [req.params.id]);
    if (!current.length) return res.status(404).json({ error: 'Order not found' });
    const guard = canTransition(current[0].status, status);
    if (!guard.ok) {
      return res.status(409).json({ error: guard.reason });
    }
    const { rows } = await db.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    // Release reserved stock when an admin cancels/refunds a stock-holding order.
    if ((status === 'cancelled' || status === 'refunded') && shouldReleaseOnCancel(current[0].status)) {
      await releaseItems(db, Array.isArray(current[0].items) ? current[0].items : []);
      console.log(`[admin] stock released for ${rows[0].receipt}`);
    }
    // Paid orders cancelled/refunded by admin get an automatic gateway refund when possible.
    let refund = { mode: 'none' };
    if ((status === 'cancelled' || status === 'refunded') && current[0].status === 'paid') {
      refund = await refundPayment({ ...current[0] });
    }
    console.log(`[admin] order ${rows[0].receipt} ${current[0].status} -> ${status} refund=${refund.mode}`);
    res.json({ order: rows[0], refund: refund.mode });
  } catch (err) {
    console.error('[admin] order update error:', err.message);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// GET /admin/orders/:id — full order for packing slips, disputes and support calls
router.get('/orders/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    const order = rows[0];
    const lineItems = Array.isArray(order.items) ? order.items : [];
    const slugs = [...new Set(lineItems.map((it) => it && it.slug).filter(Boolean))];
    let bySlug = {};
    if (slugs.length) {
      const r = await db.query('SELECT slug, name, hsn FROM products WHERE slug = ANY($1)', [slugs]);
      bySlug = Object.fromEntries(r.rows.map((p) => [p.slug, p]));
    }
    const items = lineItems.map((it) => {
      const p = bySlug[it.slug] || {};
      const qty = parseInt(it.qty, 10) || 0;
      const unitPaise = it.unit_price_paise != null ? it.unit_price_paise : 0;
      return {
        slug: it.slug,
        name: p.name || it.slug,
        hsn: p.hsn || '',
        qty,
        unitPaise,
        linePaise: unitPaise * qty,
      };
    });
    res.json({
      order: {
        id: order.id,
        receipt: order.receipt,
        status: order.status,
        createdAt: order.created_at,
        amountPaise: order.amount_paise,
        couponCode: order.coupon_code || null,
        discountPaise: Number(order.discount_paise) || 0,
        razorpayOrderId: order.razorpay_order_id || null,
        razorpayPaymentId: order.razorpay_payment_id || null,
        payMode: order.pay_mode || (String(order.status) === 'cod_pending' ? 'cod' : 'online'),
        customer: order.customer || {},
        items,
      },
    });
  } catch (err) {
    console.error('[admin] order detail error:', err.message);
    res.status(500).json({ error: 'Failed to load order' });
  }
});

// GET /admin/quotes?status=
router.get('/quotes', async (req, res) => {
  try {
    const { status } = req.query;
    let rows;
    if (status) {
      const r = await db.query('SELECT * FROM bulk_quotes WHERE status = $1 ORDER BY created_at DESC LIMIT 200', [status]);
      rows = r.rows;
    } else {
      const r = await db.query('SELECT * FROM bulk_quotes ORDER BY created_at DESC LIMIT 200');
      rows = r.rows;
    }
    res.json({ quotes: rows });
  } catch (err) {
    console.error('[admin] quotes error:', err.message);
    res.status(500).json({ error: 'Failed to list quotes' });
  }
});

// PATCH /admin/quotes/:id {status}
router.patch('/quotes/:id', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!QUOTE_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${QUOTE_STATUSES.join(', ')}` });
    }
    const { rows } = await db.query(
      'UPDATE bulk_quotes SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Quote not found' });
    console.log(`[admin] quote #${req.params.id} -> ${status}`);
    res.json({ quote: rows[0] });
  } catch (err) {
    console.error('[admin] quote update error:', err.message);
    res.status(500).json({ error: 'Failed to update quote' });
  }
});

// PATCH /admin/products/:slug/stock {stock}
router.patch('/products/:slug/stock', async (req, res) => {
  try {
    const stock = parseInt(req.body && req.body.stock, 10);
    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ error: 'stock must be an integer >= 0' });
    }
    const { rows } = await db.query(
      'UPDATE products SET stock = $1 WHERE slug = $2 RETURNING slug, stock',
      [stock, req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    console.log(`[admin] stock ${rows[0].slug} -> ${rows[0].stock}`);
    res.json({ product: rows[0] });
  } catch (err) {
    console.error('[admin] stock update error:', err.message);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

// POST /admin/quotes/:id/convert { unit_price_paise? } — agreed deal becomes a pending order
router.post('/quotes/:id/convert', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM bulk_quotes WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Quote not found' });
    const quote = rows[0];
    if (quote.order_receipt) {
      return res.json({ ok: true, receipt: quote.order_receipt, reused: true });
    }
    if (!quote.product_slug) {
      return res.status(400).json({ error: 'Quote has no product linked' });
    }
    const { rows: prows } = await db.query(
      'SELECT slug, price_paise FROM products WHERE slug = $1',
      [quote.product_slug]
    );
    if (!prows.length) return res.status(400).json({ error: `Product not found: ${quote.product_slug}` });
    const qty = Math.max(1, parseInt(quote.qty, 10) || 1);
    const override = parseInt(req.body && req.body.unit_price_paise, 10) || 0;
    const unitPaise = override > 0 ? override : prows[0].price_paise;
    if (unitPaise < 100) return res.status(400).json({ error: 'Agreed unit price too small' });
    const amountPaise = unitPaise * qty;
    const lineItems = [{ slug: quote.product_slug, qty, unit_price_paise: unitPaise }];
    const receipt = `rcpt_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

    const created = await withTransaction(async (tx) => {
      await reserveItems(tx, lineItems);
      const ins = await tx.query(
        `INSERT INTO orders (receipt, status, items, amount_paise, customer, coupon_code, discount_paise)
         VALUES ($1, 'pending', $2, $3, $4, NULL, 0) RETURNING receipt`,
        [receipt, JSON.stringify(lineItems), amountPaise, JSON.stringify({ name: quote.name || '', phone: quote.phone || '', address: '', pincode: '' })]
      );
      await tx.query(`UPDATE bulk_quotes SET status = 'won', order_receipt = $1 WHERE id = $2`, [receipt, quote.id]);
      return ins.rows[0];
    }).catch((err) => {
      if (err.code === 'INSUFFICIENT_STOCK') {
        return res.status(409).json({ error: `Insufficient stock for ${err.slug}` });
      }
      throw err;
    });
    if (!created) return; // response already sent
    console.log(`[admin] quote #${quote.id} converted -> order ${created.receipt} amount=${amountPaise}`);
    res.json({ ok: true, receipt: created.receipt, amount_paise: amountPaise });
  } catch (err) {
    console.error('[admin] quote convert error:', err.message);
    res.status(500).json({ error: 'Failed to convert quote' });
  }
});

// GET /admin/contact?status= — list enquiries
router.get('/contact', async (req, res) => {
  try {
    const { status } = req.query;
    const conds = [];
    const params = [];
    if (status) {
      params.push(status);
      conds.push(`status = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM contact_messages ${where} ORDER BY created_at DESC, id DESC LIMIT 200`,
      params
    );
    res.json({ messages: rows });
  } catch (err) {
    console.error('[admin] contact list error:', err.message);
    res.status(500).json({ error: 'Failed to list messages' });
  }
});

// PATCH /admin/contact/:id {status: new|contacted|closed}
router.patch('/contact/:id', async (req, res) => {
  try {
    if (!['new', 'contacted', 'closed'].includes(req.body && req.body.status)) {
      return res.status(400).json({ error: 'status must be one of: new, contacted, closed' });
    }
    const { rows } = await db.query(
      'UPDATE contact_messages SET status = $1 WHERE id = $2 RETURNING *',
      [req.body.status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Message not found' });
    res.json({ message: rows[0] });
  } catch (err) {
    console.error('[admin] contact update error:', err.message);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// GET /admin/questions?answered=&limit= — moderation queue (latest first)
router.get('/questions', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const conds = [];
    const params = [];
    if (req.query.answered === 'true') conds.push(`answer <> ''`);
    else if (req.query.answered === 'false') conds.push(`COALESCE(answer, '') = ''`);
    params.push(limit);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM questions ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params
    );
    res.json({ questions: rows });
  } catch (err) {
    console.error('[admin] questions list error:', err.message);
    res.status(500).json({ error: 'Failed to list questions' });
  }
});

// DELETE /admin/questions/:id — remove spam/abuse
router.delete('/questions/:id', async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM questions WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Question not found' });
    console.log(`[admin] question #${req.params.id} deleted`);
    res.json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error('[admin] question delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete question' });
  }
});

const RETURN_STATUSES = ['requested', 'approved', 'rejected', 'picked_up', 'refunded', 'closed'];

// GET /admin/stock-alerts?slug= — people waiting for restock
router.get('/stock-alerts', async (req, res) => {
  try {
    const { slug } = req.query;
    const conds = [];
    const params = [];
    if (slug) {
      params.push(slug);
      conds.push(`product_slug = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM stock_alerts ${where} ORDER BY created_at DESC, id DESC LIMIT 500`,
      params
    );
    res.json({ alerts: rows });
  } catch (err) {
    console.error('[admin] stock-alerts error:', err.message);
    res.status(500).json({ error: 'Failed to list stock alerts' });
  }
});

// POST /admin/products — create or update a product (admin catalogue management)
router.post('/products', async (req, res) => {
  try {
    const b = req.body || {};
    const slug = String(b.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) {
      return res.status(400).json({ error: 'slug must be lowercase letters, digits or dashes' });
    }
    const name = String(b.name || '').trim();
    if (name.length < 3) return res.status(400).json({ error: 'name is required (min 3 chars)' });

    const pricePaise = parseInt(b.price_paise, 10);
    if (!Number.isInteger(pricePaise) || pricePaise < 100) {
      return res.status(400).json({ error: 'price_paise must be an integer >= 100' });
    }
    const mrpPaise = parseInt(b.mrp_paise, 10) || pricePaise;
    if (mrpPaise < pricePaise) return res.status(400).json({ error: 'mrp_paise cannot be below price_paise' });
    const stock = parseInt(b.stock, 10);
    if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ error: 'stock must be an integer >= 0' });
    const specs = b.specs && typeof b.specs === 'object' ? b.specs : {};
    const images = Array.isArray(b.images) ? b.images.filter((s) => typeof s === 'string').slice(0, 10) : [];
    const videos = Array.isArray(b.videos) ? b.videos.filter((s) => typeof s === 'string').slice(0, 5) : [];

    const { rows } = await db.query(
      `INSERT INTO products (slug, name, brand, category, price_paise, mrp_paise, hsn, stock, specs, images, videos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, brand = EXCLUDED.brand, category = EXCLUDED.category,
         price_paise = EXCLUDED.price_paise, mrp_paise = EXCLUDED.mrp_paise, hsn = EXCLUDED.hsn,
         stock = EXCLUDED.stock, specs = EXCLUDED.specs, images = EXCLUDED.images, videos = EXCLUDED.videos
       RETURNING slug, name, price_paise, stock`,
      [slug, name, String(b.brand || ''), String(b.category || 'power-tools'), pricePaise, mrpPaise,
        String(b.hsn || ''), stock, JSON.stringify(specs), images, videos]
    );
    console.log(`[admin] product upsert ${slug} ${pricePaise}`);
    res.status(201).json({ product: rows[0] });
  } catch (err) {
    console.error('[admin] product save error:', err.message);
    res.status(500).json({ error: 'Failed to save product' });
  }
});

// DELETE /admin/products/:slug — remove a product from the catalogue
router.delete('/products/:slug', async (req, res) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM products WHERE slug = $1 RETURNING slug',
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    console.log(`[admin] product deleted ${rows[0].slug}`);
    res.json({ ok: true, slug: rows[0].slug });
  } catch (err) {
    console.error('[admin] product delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// GET /admin/returns?status=
router.get('/returns', async (req, res) => {
  try {
    const { status } = req.query;
    const conds = [];
    const params = [];
    if (status) {
      params.push(status);
      conds.push(`status = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM return_requests ${where} ORDER BY created_at DESC, id DESC LIMIT 200`,
      params
    );
    res.json({ returns: rows });
  } catch (err) {
    console.error('[admin] returns list error:', err.message);
    res.status(500).json({ error: 'Failed to list returns' });
  }
});

// PATCH /admin/returns/:id {status}
router.patch('/returns/:id', async (req, res) => {
  try {
    const status = String((req.body && req.body.status) || '');
    if (!RETURN_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${RETURN_STATUSES.join(', ')}` });
    }
    const { rows } = await db.query(
      'UPDATE return_requests SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Return request not found' });
    console.log(`[admin] return #${rows[0].id} (${rows[0].receipt}) -> ${status}`);
    res.json({ return: rows[0] });
  } catch (err) {
    console.error('[admin] return update error:', err.message);
    res.status(500).json({ error: 'Failed to update return' });
  }
});

// GET /admin/reviews?verified=&limit= — moderation queue (latest first)
router.get('/reviews', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const conds = [];
    const params = [];
    if (req.query.verified === 'true' || req.query.verified === 'false') {
      params.push(req.query.verified === 'true');
      conds.push(`verified = $${params.length}`);
    }
    params.push(limit);
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT * FROM reviews ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params
    );
    res.json({ reviews: rows });
  } catch (err) {
    console.error('[admin] reviews list error:', err.message);
    res.status(500).json({ error: 'Failed to list reviews' });
  }
});

// PATCH /admin/reviews/:id {verified: bool} — approve/unapprove
router.patch('/reviews/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'UPDATE reviews SET verified = $1 WHERE id = $2 RETURNING *',
      [!!(req.body && req.body.verified), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Review not found' });
    res.json({ review: rows[0] });
  } catch (err) {
    console.error('[admin] review update error:', err.message);
    res.status(500).json({ error: 'Failed to update review' });
  }
});

// DELETE /admin/reviews/:id — remove spam/abuse
router.delete('/reviews/:id', async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM reviews WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Review not found' });
    console.log(`[admin] review #${req.params.id} deleted`);
    res.json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error('[admin] review delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});
router.get('/coupons', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json({ coupons: rows });
  } catch (err) {
    console.error('[admin] coupons list error:', err.message);
    res.status(500).json({ error: 'Failed to list coupons' });
  }
});

// POST /admin/coupons { code, pct_off, max_discount_paise?, min_order_paise?, active?, expires_at?, max_uses? }
router.post('/coupons', async (req, res) => {
  try {
    const code = String((req.body && req.body.code) || '').trim().toUpperCase();
    const pct = parseInt(req.body && req.body.pct_off, 10);
    if (!code) return res.status(400).json({ error: 'code required' });
    if (!Number.isInteger(pct) || pct < 1 || pct > 90) {
      return res.status(400).json({ error: 'pct_off must be an integer 1-90' });
    }
    const maxD = Math.max(0, parseInt(req.body.max_discount_paise, 10) || 0);
    const minO = Math.max(0, parseInt(req.body.min_order_paise, 10) || 0);
    const active = req.body.active !== false;
    let expiresAt = null;
    if (req.body.expires_at) {
      const d = new Date(req.body.expires_at);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'expires_at must be a valid date' });
      if (d.getTime() <= Date.now()) return res.status(400).json({ error: 'expires_at must be in the future' });
      expiresAt = d.toISOString();
    }
    const maxUsesRaw = parseInt(req.body.max_uses, 10);
    const maxUses = Number.isInteger(maxUsesRaw) && maxUsesRaw > 0 ? maxUsesRaw : null;
    const { rows } = await db.query(
      `INSERT INTO coupons (code, pct_off, max_discount_paise, min_order_paise, active, expires_at, max_uses)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (code) DO UPDATE SET pct_off = EXCLUDED.pct_off, max_discount_paise = EXCLUDED.max_discount_paise,
         min_order_paise = EXCLUDED.min_order_paise, active = EXCLUDED.active,
         expires_at = EXCLUDED.expires_at, max_uses = EXCLUDED.max_uses
       RETURNING *`,
      [code, pct, maxD, minO, active, expiresAt, maxUses]
    );
    console.log(`[admin] coupon upsert ${code} ${pct}% exp=${expiresAt || '-'} maxUses=${maxUses || '-'}`);
    res.status(201).json({ coupon: rows[0] });
  } catch (err) {
    console.error('[admin] coupon save error:', err.message);
    res.status(500).json({ error: 'Failed to save coupon' });
  }
});

// PATCH /admin/coupons/:code { active } — quick enable/disable
router.patch('/coupons/:code', async (req, res) => {
  try {
    const { rows } = await db.query(
      'UPDATE coupons SET active = $1 WHERE UPPER(code) = UPPER($2) RETURNING *',
      [req.body && req.body.active !== false, req.params.code]
    );
    if (!rows.length) return res.status(404).json({ error: 'Coupon not found' });
    res.json({ coupon: rows[0] });
  } catch (err) {
    console.error('[admin] coupon toggle error:', err.message);
    res.status(500).json({ error: 'Failed to update coupon' });
  }
});

module.exports = router;
