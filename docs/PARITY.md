# Feature Parity vs toolsvilla.com

Comparison of the live Toolsvilla store against this clone. Last verified: wave 130 (deals computed in SQL, verified in HTML).

## Storefront

| Live feature | Clone status |
|---|---|
| Homepage hero, categories, brands, bestsellers | ✅ `app/page.js` — **server-rendered** catalogue strips + ItemList JSON-LD; client adds recently-viewed/wishlist |
| Mega-menu / category nav | ✅ header category nav |
| Search with suggestions | ✅ `/store/search` + `/store/search/suggest` typeahead (products, brands, categories; keyboard nav; works without JS via form submit); results page has a **query-specific heading, breadcrumb and noindex** (search URLs never compete with category pages) |
| No-results handling | ✅ search/filter empty state offers clear-filters, browse-all and a **WhatsApp enquiry pre-filled with the query** instead of a dead end |
| Category listing: brand/price/discount/sort filters | ✅ `app/category/[slug]` — **server-rendered** first page; brand, min/max price, text, sort, clear-all (logic in tested `lib/catalog.js`) |
| Product gallery, specs, EMI plans | ✅ `app/product/[slug]` — **server-rendered** content (name/price/specs in initial HTML) + client interactivity; gallery, EMI 3/6/9/12, **WhatsApp share** |
| Product videos | ✅ `videos[]` column + seed data + embedded player on product page (YouTube/Vimeo, host-allowlisted) |
| Reviews + ratings, Q&A | ✅ `/store/engage/*` + product page UI; **star rating with review count shown next to the product title** (anchor to the reviews panel), "be the first to review" when none |
| Admin catalogue CRUD (create/edit/delete products) | ✅ admin Products tab + `POST/DELETE /admin/products` |
| Accounting export | ✅ `GET /admin/orders/export.csv` with **status + date-range (from/to)** filters, RFC-style quoting, shipping column; Orders tab has from/to date pickers for both the list and the export |
| Dashboard metrics | ✅ Overview shows **orders today, revenue today, 7-day revenue**, unpaid/COD-pending count and **manual refunds needing action** (computed by a tested summariser) |
| Bulk quote / B2B | ✅ `/bulk-quote`, `/bulk-orders`, admin pipeline + one-click convert-to-order; buyers check their own quote status by phone (phone-scoped, no PII leak) |
| Pincode delivery check | ✅ `/store/service/pincode` + product page and cart checkers; **COD availability is amount-aware** (product price × qty and cart subtotal are sent, so a high-value item says "prepaid only" instead of promising COD) |
| Out-of-stock handling | ✅ badges everywhere + "tell me when it's back" (`/store/service/stock-alert`) with **honest copy** (team contacts you — no automated email exists yet); admin Stock tab lists pending restock requests |
| Wishlist | ✅ localStorage + `/wishlist` with **live stock refresh** (stale saved stock corrected on load), move-one / move-all (skips sold-out), sold-out button disabled, clear all |
| Recently viewed | ✅ `tw_recent` strip on homepage; product views recorded via a tested helper (`pushRecent`/`parseRecent`: de-dupe, newest-first, 8-item cap, corrupt-storage safe) |
| Deals of the day + countdown | ✅ `/deals` — **`GET /store/deals`** computes the discount and ordering in SQL (no first-page truncation), server-rendered with ItemList + breadcrumb schema and a client-only countdown |
| Brand pages | ✅ `GET /store/brands` (SQL aggregation — no 100-product truncation) drives a **server-rendered directory**, and `/brand/[name]` renders via the brand filter with breadcrumbs |
| Cart + coupons + GST note | ✅ live stock check in cart (`/store/products/stock`), sold-out/over-quantity blocking, case-insensitive coupons, expiry + usage caps; admin Coupons tab; **checkout shows the inclusive GST component** |
| Checkout (UPI/cards/netbanking/EMI/COD) | ✅ Razorpay + COD + mock fallback; **order summary with per-line qty/price and "Edit cart"** before payment; COD capped by **one shared policy** (`COD_MAX_PAISE`, mirrored to the UI via `NEXT_PUBLIC_COD_MAX_PAISE`), enforced server-side and reflected in pincode answers |
| Shipping | ✅ real policy, not just copy: free by default; optional flat fee with free-shipping threshold (`SHIPPING_FEE_PAISE` / `FREE_SHIPPING_ABOVE_PAISE`), added server-side to the charged total and shown on checkout |
| Order success + live verify | ✅ polling `/store/checkout/verify` |
| Track order + cancel | ✅ `/track-order`, `/store/service/track`, customer cancel; COD orders never show a phantom "payment confirmed" step; refund outcome (auto/manual) persisted and flagged in admin |
| My orders by phone | ✅ `/my-orders` shows **item names and quantities**, pay mode, plus Reorder and WhatsApp help |
| GST invoice (print/PDF) | ✅ `/invoice/[receipt]` (browser print → PDF); seller GSTIN + **buyer GSTIN captured at checkout**, item lines with HSN, **shipping line**, coupon line, and totals that reconcile (`items − discount + shipping = total`) |
| 404 + error handling | ✅ branded `not-found.js` (search, categories, WhatsApp — not a dead end) returns real 404 status; `error.js` boundary offers retry/home/browse instead of a blank app-error screen |
| Policies: shipping/returns/warranty/privacy/terms/about/contact/EMI | ✅ 9 static pages + footer |
| Contact / support | ✅ contact form persisted + admin Messages tab; **WhatsApp deep links** from admin (messages, quotes, returns) and from customer order history |
| Returns / exchange (RMA) request | ✅ `/returns` form → `/store/service/returns` → admin Returns tab with status workflow; **customers can check their return status** by receipt + phone |
| Newsletter | ✅ `/store/service/subscribe` + footer form; admin Messages tab lists subscribers and exports CSV |
| XML sitemap | ✅ `/sitemap.xml` includes home, policies, categories, every product **and every brand**; **never lists robots-blocked pages** (test enforces the two lists agree) |
| robots.txt | ✅ generated by `app/robots.js` from `NEXT_PUBLIC_SITE_URL` (private paths disallowed, sitemap link always correct); blocks `/invoice` too |
| SEO metadata | ✅ per-product/category/brand titles+descriptions+canonical+OG; Product JSON-LD with price, availability, **itemCondition**, HSN and **aggregateRating only when real reviews exist**; homepage **Organization + WebSite/SearchAction**; **BreadcrumbList + visible breadcrumbs on product, category and brand pages**; `NEXT_PUBLIC_SITE_URL` sets the base |
| Per-route metadata | ✅ all 11 client-rendered routes have metadata layouts: public pages (`/contact-us`, `/bulk-quote`) get title/description/**canonical that refuses to point at localhost**; private ones (cart, checkout, wishlist, my-orders, track-order, returns, order-success, invoice, admin) are `noindex, nofollow` |

## Hardening

| Control | Status |
|---|---|
| Response headers | ✅ `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, HSTS when served over https |
| Server fingerprint | ✅ `x-powered-by` disabled |
| Abuse limits | ✅ per-IP limit on public writes (`RATE_LIMIT_*`), separate admin throttle against token guessing (`ADMIN_RATE_LIMIT_*`), receipt-lookup limit (`LOOKUP_RATE_LIMIT_MAX`) |
| Receipt privacy | ✅ invoice/track links use 64-bit random receipt IDs; guessable timestamps + 6 digits replaced |
| CORS | ✅ `FRONTEND_URL` allowlist (comma-separated); same-origin `/api` needs none |
| Admin access | ✅ token via `x-admin-token` on every admin route, compared in constant time |
| SQL | ✅ parameterised everywhere; sort/filter values allowlisted |
| Input validation | ✅ public writes clamp/validate: quote qty (1–100k), phone format, name/message/review lengths; **checkout customer block normalised** (phone → 10 digits, pincode 6, address ≤500) so orders stay trackable; admin statuses allowlisted; stock/prices bounded |
| Observability | ✅ every response carries `X-Request-Id` (honours a sane upstream id); 4xx/5xx JSON includes `requestId`, and 5xx logs are prefixed with it so a customer quote can be traced |
| SSR caching | ✅ short-TTL cache (`SSR_CACHE_TTL_MS`, default 10s) on server-rendered product/category/home fetches — measured 6 page views → 1 backend call, still revalidating after TTL |

## Needs your inputs (code slots ready)

| Item | What to provide |
|---|---|
| Real product photos | Placeholders exist and are auto-checked; replace with your shoot/vendor photos by overwriting `apps/storefront/public/images/<slug>.svg` (or edit `data/products.js` + rerun `scripts/gen-product-images.mjs`) |
| VPS + domain | Any Mumbai/Bangalore 4vCPU/8GB → `docs/VPS-DEPLOY.md` |
| Razorpay live keys | Dashboard → backend `.env`, webhook URL |
| OTP-SMS login | MSG91/equivalent key → account auth can be added on top of phone-based orders |
| Real product videos | Replace demo embed URLs in `apps/backend/data/products.js` with your own (YouTube/Vimeo embeds work today) |
| Email / SMS notifications | No mailer or SMS gateway is wired up, and no copy promises one (a test enforces this). Supply SMTP or MSG91 credentials to add order-confirmation emails/OTP login. |
| Trust / branding | ✅ store name, phone, email and GSTIN come from `lib/store.js` (`NEXT_PUBLIC_STORE_*`) and propagate to every page, the invoice letterhead and WhatsApp templates — a test fails on any hardcoded brand name (verified by building with a different name) |
| Seller GSTIN + phone/email | Set `NEXT_PUBLIC_STORE_GSTIN/PHONE/EMAIL` in `.env` (one place: `lib/store.js`) |
| Social preview image (og:image) | WhatsApp/Facebook don't render SVG, so supply a 1200×630 **PNG** (logo + tagline). Product pages currently share as text + link; the WhatsApp Share button is already live. |

## Tests

## Tests

One command runs everything that works without Docker/Postgres:

```
node scripts/verify-all.mjs    # 6/6: backend suite, storefront suite, compose
                               # structure, production build, mojibake audit,
                               # unbacked-promise audit  (exit code gates deploys)
node scripts/smoke.mjs         # live routes, needs running servers (29/29 incl. a real 404)
```

Backend: `cd apps/backend && npm test` — 150 tests (pricing math, GST, EMI, catalog validity,
coupon expiry/usage caps, webhook state machine + signature, LIKE escaping, status
transitions, refunds, readiness probe, frontend↔backend API contract (every storefront
call resolves to a mounted route), plus route-level integration tests against an
in-memory DB: checkout/stock, coupons, cancel, webhooks, quote conversion, admin guard,
invoice balance, returns workflow, stock alerts).

Storefront: `cd apps/storefront && npm test` — 58 tests (catalog filter/sort logic, cart
add/merge/clamp + reorder mapping + stock status, GST-inclusive split, COD cap + shipping
mirrors, deals threshold/sorting, brand directory counts, recently-viewed de-dupe/cap,
canonical-URL guard, WhatsApp links (customer + share), TTL cache eviction/expiry,
JSON-LD builders, API base + server base resolution, misconfiguration guard, NaN-proof
self-healing storage, wishlist dedupe + stock, store contact config + wa.me links,
paise→rupee normalisation, readable API errors, video embed allowlist).

Build: `cd apps/storefront && npm run build` must compile all 25 routes.
Smoke: `BASE_URL=... node scripts/smoke.mjs` — 28 routes, expects 200 + real content.

Fresh-clone check (do this before trusting a deploy): clone into an empty dir, then
run the storefront suite (needs no install) and `apps/backend` install + suite.
Both must be green with zero setup beyond `git clone`.

Seed (`cd apps/backend && npm run seed`) is **repeatable**: it refreshes catalogue
content (names, prices, images, specs, videos) and coupon terms, but never overwrites
live `stock` or coupon `used_count`/`active`.
