-- E-Commerce schema
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  price_paise INTEGER NOT NULL DEFAULT 0,
  mrp_paise INTEGER NOT NULL DEFAULT 0,
  hsn TEXT NOT NULL DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0,
  specs JSONB NOT NULL DEFAULT '{}'::jsonb,
  images TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  receipt TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  amount_paise INTEGER NOT NULL DEFAULT 0,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  customer JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bulk_quotes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  product_slug TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL DEFAULT 1,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_orders_receipt ON orders(receipt);
CREATE INDEX IF NOT EXISTS idx_orders_rzp_order ON orders(razorpay_order_id);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  product_slug TEXT NOT NULL REFERENCES products(slug),
  name TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  product_slug TEXT NOT NULL REFERENCES products(slug),
  name TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  pct_off INTEGER NOT NULL CHECK (pct_off >= 0 AND pct_off <= 90),
  max_discount_paise INTEGER NOT NULL DEFAULT 0,
  min_order_paise INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_slug ON reviews(product_slug);
CREATE INDEX IF NOT EXISTS idx_questions_slug ON questions(product_slug);

-- Wave 5: coupon audit columns (idempotent for existing DBs)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_paise INTEGER NOT NULL DEFAULT 0;

-- Wave 7: quote-to-order conversion link (idempotent)
ALTER TABLE bulk_quotes ADD COLUMN IF NOT EXISTS order_receipt TEXT;

-- Wave 14: keep the buyer's free-text product description alongside the resolved slug
ALTER TABLE bulk_quotes ADD COLUMN IF NOT EXISTS product_name TEXT NOT NULL DEFAULT '';

-- Wave 54: product videos (embed URLs), optional per SKU
ALTER TABLE products ADD COLUMN IF NOT EXISTS videos TEXT[] NOT NULL DEFAULT '{}';

-- Wave 57: return / exchange requests (RMA)
CREATE TABLE IF NOT EXISTS return_requests (
  id SERIAL PRIMARY KEY,
  receipt TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'requested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_returns_status ON return_requests(status);
CREATE INDEX IF NOT EXISTS idx_returns_receipt ON return_requests(receipt);

-- Wave 58: "notify me when back in stock" alerts
CREATE TABLE IF NOT EXISTS stock_alerts (
  id SERIAL PRIMARY KEY,
  product_slug TEXT NOT NULL REFERENCES products(slug),
  email TEXT NOT NULL,
  notified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_slug, email)
);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_slug ON stock_alerts(product_slug);

-- Wave 64: coupon expiry + usage caps (idempotent for existing DBs)
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_uses INTEGER;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0;

-- Wave 79: record how an order is paid ('cod' | 'online') so timelines and invoices
-- never imply a payment that was not taken.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pay_mode TEXT;

-- Wave 80: persist refund outcomes so a manual refund can't be forgotten
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_mode TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- Wave 106: shipping charged on the order (0 = free). Needed so invoices reconcile:
-- items − discount + shipping = total.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_paise INTEGER NOT NULL DEFAULT 0;
-- Delivery timestamp: the 7-day return window published in the policy is measured from
-- here, not from order creation.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
-- Two-level categories: products carry a leaf slug; the tree lives in data/categories.js.
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory TEXT;
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory);
-- Long-form copy shown on the product page (the page already rendered this field, but no
-- column existed, so the section was permanently blank).
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;

-- Wave 11: contact enquiries (persisted, admin-triaged)
CREATE TABLE IF NOT EXISTS contact_messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_status ON contact_messages(status);

-- Wave 210: customer accounts, sessions, saved addresses -------------------------------
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  pincode TEXT NOT NULL DEFAULT '',
  state_code TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Passwordless proof of phone ownership for guest order history / cancellation.
-- Only a hash of the 6-digit code is stored, it expires in 5 minutes and allows 5 attempts.
CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, created_at DESC);

-- Link orders to an account (nullable: guest checkout stays first-class) and store the
-- buyer email so transactional notifications have somewhere to go.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders((customer->>'phone'));

-- Refund accounting: a partial refund must not close the order or restock the goods.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_paise INTEGER NOT NULL DEFAULT 0;

-- Webhook idempotency: Razorpay retries and concurrent duplicate deliveries must not
-- release stock or refund twice.
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transactional email outbox. Notifications are written in the same transaction as the
-- state change, then delivered by a small worker (SMTP when configured, logged otherwise).
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'transactional',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  dedupe_key TEXT UNIQUE,
  order_receipt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_receipt ON notifications(order_receipt);

-- Wave 211: free-text delivery notes captured at checkout.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;

-- Wave 212: courier / AWB tracking captured by the warehouse at dispatch.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS awb TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;
