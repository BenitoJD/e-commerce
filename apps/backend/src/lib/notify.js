// Transactional email outbox.
//
// Delivery is deliberately decoupled from checkout: writing the outbox row happens in the
// same transaction as the order state change, while SMTP can fail/retry without affecting
// the sale. Without SMTP configured (local dev, CI) messages are recorded as `logged` so the
// admin console and tests can prove they were produced.
const db = require('../db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && EMAIL_RE.test(email);
}

function formatInr(paise) {
  return `₹${(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
}

// Queue one message. `exec` may be a transaction client so the message commits atomically
// with the order change. dedupe_key makes retries/idempotent webhooks send exactly one copy.
async function queueEmail(exec, { to, subject, body, type = 'transactional', dedupeKey = null, orderReceipt = null }) {
  const email = normalizeEmail(to);
  if (!isEmail(email)) return { queued: false, reason: 'invalid email' };
  const runner = exec || db;
  const { rows } = await runner.query(
    `INSERT INTO notifications (to_email, subject, body, type, dedupe_key, order_receipt)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [email, String(subject || '').slice(0, 300), String(body || ''), type, dedupeKey, orderReceipt]
  );
  return { queued: rows.length > 0, id: rows[0] ? rows[0].id : null };
}

function smtpConfigured(env = process.env) {
  return Boolean(env.SMTP_HOST && env.SMTP_FROM);
}

// Send undelivered messages. Returns a summary; never throws per-message.
async function flushNotifications({ limit = 25, env = process.env } = {}) {
  const summary = { sent: 0, logged: 0, failed: 0 };
  let transport = null;
  if (smtpConfigured(env)) {
    try {
      // Lazy require: the dependency is optional for local installs.
      // eslint-disable-next-line global-require, import/no-extraneous-dependencies
      const nodemailer = require('nodemailer');
      transport = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT || 587),
        secure: String(env.SMTP_SECURE || '').toLowerCase() === 'true',
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS || '' } : undefined,
      });
    } catch (err) {
      console.error('[notify] SMTP configured but nodemailer is unavailable:', err.message);
      return summary;
    }
  }

  const { rows } = await db.query(
    `SELECT id, to_email, subject, body FROM notifications
      WHERE status = 'queued' AND attempts < 5
      ORDER BY created_at ASC LIMIT $1`,
    [limit]
  );

  for (const row of rows) {
    if (!transport) {
      // Development/CI: keep the message and record that it would have been sent.
      await db.query(
        "UPDATE notifications SET status = 'logged', attempts = attempts + 1, sent_at = NOW() WHERE id = $1",
        [row.id]
      );
      console.log(`[notify] (no SMTP) ${row.to_email}: ${row.subject}`);
      summary.logged += 1;
      continue;
    }
    try {
      await transport.sendMail({
        from: env.SMTP_FROM,
        to: row.to_email,
        subject: row.subject,
        text: row.body,
      });
      await db.query(
        "UPDATE notifications SET status = 'sent', attempts = attempts + 1, sent_at = NOW(), error = NULL WHERE id = $1",
        [row.id]
      );
      summary.sent += 1;
    } catch (err) {
      await db.query(
        "UPDATE notifications SET status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'queued' END, attempts = attempts + 1, error = $2 WHERE id = $1",
        [row.id, String(err.message || err).slice(0, 500)]
      );
      summary.failed += 1;
    }
  }
  return summary;
}

const STORE = {
  name: process.env.NEXT_PUBLIC_STORE_NAME || 'E-Commerce',
  email: process.env.NEXT_PUBLIC_STORE_EMAIL || 'care@ecommerce.in',
  phone: process.env.NEXT_PUBLIC_STORE_PHONE || '919999999999',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || process.env.STOREFRONT_URL || 'http://localhost:3000',
};

function orderSummaryLines(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items
    .map((it) => `  • ${it.qty} × ${it.name || it.slug} — ${formatInr((it.unit_price_paise || 0) * (it.qty || 0))}`)
    .join('\n');
}

// Customer-facing order emails. Keep the copy honest and free of promises the app does not
// keep (e.g. never claim a courier tracking link when no AWB exists).
function orderEmail(order, kind) {
  const receipt = order.receipt;
  const trackUrl = `${STORE.siteUrl}/track-order?receipt=${encodeURIComponent(receipt)}`;
  const invoiceUrl = `${STORE.siteUrl}/invoice/${encodeURIComponent(receipt)}`;
  const items = orderSummaryLines(order);
  const total = formatInr(order.amount_paise);
  const name = (order.customer && order.customer.name) || 'there';

  const texts = {
    placed: {
      subject: `Order confirmed: ${receipt} — ${STORE.name}`,
      body: `Hi ${name},\n\nThank you for your order ${receipt}. We have received it and will keep you updated.\n\n${items}\n\nTotal: ${total}${order.pay_mode === 'cod' ? ' (Cash on Delivery)' : ''}\n\nTrack: ${trackUrl}\nGST invoice: ${invoiceUrl}\n\n— ${STORE.name}`,
    },
    paid: {
      subject: `Payment received for ${receipt} — ${STORE.name}`,
      body: `Hi ${name},\n\nWe received your payment for order ${receipt}. Total: ${total}.\n\nItems:\n${items}\n\nWe will notify you when it ships.\n\n— ${STORE.name}`,
    },
    shipped: {
      subject: `Order ${receipt} has shipped — ${STORE.name}`,
      body: `Hi ${name},\n\nGood news — order ${receipt} has left our warehouse. Delivery typically takes 3–7 working days.\n\nTrack: ${trackUrl}\n\n— ${STORE.name}`,
    },
    delivered: {
      subject: `Order ${receipt} delivered — ${STORE.name}`,
      body: `Hi ${name},\n\nOrder ${receipt} was delivered. We hope everything arrived in good condition.\n\nNeed help or a return? https://${STORE.siteUrl.replace(/^https?:\/\//, '')}/returns\nInvoice: ${invoiceUrl}\n\n— ${STORE.name}`,
    },
    cancelled: {
      subject: `Order ${receipt} cancelled — ${STORE.name}`,
      body: `Hi ${name},\n\nOrder ${receipt} has been cancelled. If you paid online, any refund is processed to the original payment method (3–5 working days once initiated).\n\n— ${STORE.name}`,
    },
    refunded: {
      subject: `Refund processed for ${receipt} — ${STORE.name}`,
      body: `Hi ${name},\n\nA refund has been recorded for order ${receipt}. Refunds usually reach the original payment method in 3–5 working days.\n\n— ${STORE.name}`,
    },
    return_requested: {
      subject: `Return request received for ${receipt} — ${STORE.name}`,
      body: `Hi ${name},\n\nWe received your return/exchange request for order ${receipt}. Our team will contact you on the order phone number.\n\n— ${STORE.name}`,
    },
  };
  const chosen = texts[kind] || texts.placed;
  return { subject: chosen.subject, body: chosen.body };
}

async function notifyOrder(exec, order, kind, { dedupe = null } = {}) {
  const email = order.customer_email || (order.customer && order.customer.email);
  if (!isEmail(email)) return { queued: false, reason: 'order has no email' };
  const { subject, body } = orderEmail(order, kind);
  return queueEmail(exec, {
    to: email,
    subject,
    body,
    type: `order_${kind}`,
    dedupeKey: dedupe || (order.receipt ? `${order.receipt}:${kind}` : null),
    orderReceipt: order.receipt || null,
  });
}

async function notifyPasswordReset(to, link) {
  return queueEmail(null, {
    to,
    subject: `Reset your ${STORE.name} password`,
    body: `We received a request to reset your password.\n\nOpen this link to choose a new password (valid for 30 minutes):\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
    type: 'password_reset',
    dedupeKey: `reset:${normalizeEmail(to)}:${Date.now()}`,
  });
}

async function notifyStockBack(to, productName, productSlug = '') {
  return queueEmail(null, {
    to,
    subject: `${productName} is back in stock — ${STORE.name}`,
    body: `Good news — ${productName} is available again at ${STORE.name}.\n\nShop now: ${STORE.siteUrl}/product/${encodeURIComponent(productSlug)}\n\n— ${STORE.name}`,
    type: 'stock_back',
    dedupeKey: null,
  });
}

module.exports = {
  EMAIL_RE,
  normalizeEmail,
  isEmail,
  queueEmail,
  flushNotifications,
  notifyOrder,
  notifyPasswordReset,
  notifyStockBack,
  orderEmail,
  smtpConfigured,
  STORE,
};
