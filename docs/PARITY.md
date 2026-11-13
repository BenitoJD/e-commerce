# Feature Parity vs toolsvilla.com

Comparison of the live Toolsvilla store against this clone. Last verified: wave 207 (launched against real PostgreSQL and tested end to end).

**Status: feature parity complete.** Every row in this document is ✅; the only outstanding
items are the operator inputs listed under *Needs your inputs* (photos, VPS, live keys,
SMTP/SMS, store identity) — none of which is code work.

Evidence at this HEAD: **CI green** on Ubuntu/Node 20 (`verify-all` + the live `self-audit`),
backend **298** tests, storefront **112** tests, self-audit **3/3** (36/36 routes, 17/17 pages,
74/74 sitemap URLs), fresh-clone check **5/5**, production build **28 routes**.

## Storefront

| Live feature | Clone status |
|---|---|
| Homepage hero, categories, brands, bestsellers | ✅ `app/page.js` — **server-rendered** catalogue strips + ItemList JSON-LD; client adds recently-viewed/wishlist |
| Mega-menu / category nav | ✅ header category nav |
| Search with suggestions | ✅ `/store/search` + `/store/search/suggest` typeahead (products, brands, categories; keyboard nav; works without JS via form submit); **search URLs server-render their own matches** (with the right total), use a query-specific heading/breadcrumb and are **noindex** |
| No-results handling | ✅ search/filter empty state offers clear-filters, browse-all and a **WhatsApp enquiry pre-filled with the query** instead of a dead end |
| Category listing: brand/price/discount/sort filters | ✅ `app/category/[slug]` — **server-rendered** first page with the **true total passed through SSR** (57 products, not the 40 rendered); brand, min/max price, text and sort applied **by the API**; paging respects filters; brand options from `/store/brands`; filter requests debounced (250 ms) |
| Nested categories (2 levels) | ✅ `data/categories.js` tree (7 parents, 18 leaf subcategories) matched to the real catalogue; every product carries a taxonomy-valid `subcategory` (guarded); `GET /store/categories` returns the tree **with per-node counts**; `/store/products` accepts `category=pumps`, `category=pumps/submersible`, a bare `submersible`, or `subcategory=…`; **`/category/<parent>/<child>` pages are server-rendered** with their own title/canonical/breadcrumb JSON-LD, and both parent and child pages show **child chips with counts** (`aria-current` on the active one). **Every parent and child path is in the sitemap**, derived from the taxonomy, and the nested route is covered by the live smoke suite (36/36). The **admin product form assigns both levels**, validated server-side |
| Product gallery, specs, EMI plans | ✅ `app/product/[slug]` — **server-rendered** content (name/price/specs in initial HTML) + client interactivity; gallery, EMI 3/6/9/12, **WhatsApp share**, **star rating beside the title**, a **"You save ₹X (N% off MRP)"** line under the price, and a **long-form description** (column + seeded copy; the page had rendered this field against a column that never existed) |
| Product videos | ✅ `videos[]` column + seed data + embedded player on product page (YouTube/Vimeo, host-allowlisted) |
| Reviews + ratings, Q&A | ✅ `/store/engage/*` + product page UI; **star rating with review count shown next to the product title** (anchor to the reviews panel), "be the first to review" when none |
| Admin catalogue CRUD (create/edit/delete products) | ✅ admin Products tab (search by name/brand/slug, **paged with Load more** so nothing beyond 100 is unreachable) + `POST/DELETE /admin/products`; the form assigns **category and subcategory from the live taxonomy** (server rejects an unknown category or a child filed under the wrong parent, which would make the product unreachable in navigation) and edits the description, **image paths and video URLs** — each guarded by a static test since the form only renders after the token is entered |
| Accounting export | ✅ `GET /admin/orders/export.csv` with **status + date-range (from/to)** filters, RFC-style quoting and shipping column — plus the columns a GST return needs: **taxable value, GST amount @ 18% and place-of-supply state**. Tax is computed from the **charged total (freight included)**, exactly as the invoice does, and a test asserts the CSV figures equal the invoice's to the paisa **for an order with a shipping charge**; Orders tab has from/to date pickers for both the list and the export |
| Dashboard metrics | ✅ Overview shows **orders today, revenue today, 7-day revenue**, unpaid/COD-pending count and **manual refunds needing action** (computed by a tested summariser) |
| Admin order paging | ✅ Orders list supports `limit`/`offset` with a **Load more orders** button, so history beyond the first page stays reachable |
| Admin invoice access | ✅ **Invoice** link on every order row and **Open GST invoice** in the detail panel — support and GST filing no longer require hand-building `/invoice/<receipt>` (guarded by a test) |
| Admin charge breakdown | ✅ order detail shows **items − coupon + shipping = total charged** with a red `role="alert"` warning when it doesn't reconcile, computed by a tested pure helper (`lib/orderMath.js`) |
| Admin bulk order actions | ✅ row checkboxes + select-all with **Mark shipped / Mark delivered / Cancel selected** via one `POST /admin/orders/bulk-status` (max 200 ids); illegal transitions are **skipped with a reason** rather than failing the batch, and a shared helper keeps stock release + refunds identical to single-order updates |
| Warehouse picking list | ✅ **Print picking list** for the selected orders (`/admin/picking?ids=…`) — one row per SKU with the **combined quantity** across orders, HSN and a tick box; print-friendly (`no-print` controls), noindex, aggregation covered by tests; **shares the admin token with the console** via `lib/adminToken.js` (same key, same storage) |
| Stock reservation | ✅ transactional reserve on checkout; released on cancel, refund, failed payment (webhook) — and **abandoned checkouts no longer hold stock forever**: a background sweep runs every `STALE_SWEEP_MINUTES` (default 15, `0` disables, skipped in tests) through the same `transitionOrder` helper, plus an on-demand **"Release abandoned holds"** admin button and `POST /admin/orders/release-stale` (5 min–7 day window, max 200/run) |
| Admin session | ✅ one token helper (`getAdminToken/setAdminToken/clearAdminToken`, `sessionStorage` key `tk_admin`) used by the console and every admin sub-page — a page inventing its own key silently behaved as logged out, so a test now forbids direct key access |
| Print output | ✅ global print stylesheet in `globals.css` — `.no-print`, header/footer hidden, `.print-card` — shared by the **GST invoice and the picking list** (previously `.no-print` was undefined outside the invoice, so picking-list buttons would have printed). Guarded by a test |
| Keyboard focus | ✅ visible focus ring on `.btn-primary`/`.btn-outline` (focus-visible + offset) and on all links/buttons via a global `:focus-visible` rule |
| Bulk quote / B2B | ✅ `/bulk-quote`, `/bulk-orders`, admin pipeline + one-click convert-to-order; buyers check their own quote status by phone (phone-scoped, no PII leak). The quote page's heading and intro render **outside** its Suspense boundary — a `useSearchParams()` bailout previously left the server HTML with only "Loading..." and **no `<h1>`** |
| Pincode delivery check | ✅ `/store/service/pincode` + product page and cart checkers; **COD availability is amount-aware** (product price × qty and cart subtotal are sent, so a high-value item says "prepaid only" instead of promising COD) |
| Out-of-stock handling | ✅ badges everywhere + "tell me when it's back" (`/store/service/stock-alert`) with **honest copy** (team contacts you — no automated email exists yet); admin Stock tab lists pending restock requests |
| Product comparison | ✅ **`/compare`** — add up to **4** products with the "⇄ Compare" button on any product page (`aria-pressed` state, "See comparison" link once added), reachable from the **header** as well since the list is per-browser; the table lines up price, MRP, availability, HSN and the **union of every spec key** (missing values show "—"), with per-column Remove, Clear all and Add-to-cart. List is per-visitor (localStorage), so the page is **noindex + robots-disallowed** and absent from the sitemap |
| Wishlist | ✅ localStorage + `/wishlist` with **live stock refresh** (stale saved stock corrected on load), move-one / move-all (skips sold-out), sold-out button disabled, clear all |
| Recently viewed | ✅ `tw_recent` strip on homepage; product views recorded via a tested helper (`pushRecent`/`parseRecent`: de-dupe, newest-first, 8-item cap, corrupt-storage safe) |
| Deals of the day + countdown | ✅ `/deals` — **`GET /store/deals`** computes the discount and ordering in SQL (no first-page truncation), server-rendered with ItemList + breadcrumb schema and a client-only countdown |
| Brand pages | ✅ `GET /store/brands` (SQL aggregation) drives a server-rendered directory; `/brand/[name]` renders via the search brand filter with **true product total** and a page size that matches the client's paging (Load more works) |
| Cart + coupons + GST note | ✅ live stock check in cart (`/store/products/stock`), sold-out/over-quantity blocking, case-insensitive coupons, expiry + usage caps; admin Coupons tab; **checkout shows the inclusive GST component** |
| Checkout (UPI/cards/netbanking/EMI/COD) | ✅ Razorpay + COD; **order summary with per-line qty/price and "Edit cart"** before payment; COD capped by **one shared policy** (`COD_MAX_PAISE`, mirrored to the UI via `NEXT_PUBLIC_COD_MAX_PAISE`), enforced server-side and reflected in pincode answers. A mock order id is used **only in development** — in production a missing key returns **503 `PAYMENTS_NOT_CONFIGURED` before any stock is reserved**, and a Razorpay outage returns **502** after releasing the reservation, marking the order failed and freeing the coupon (no half-started payments held as pending) |
| Shipping | ✅ real policy, not just copy: free by default; optional flat fee with free-shipping threshold (`SHIPPING_FEE_PAISE` / `FREE_SHIPPING_ABOVE_PAISE`), added server-side to the charged total and shown on checkout — and the **cart shows the same shipping line plus a nudge** ("Add ₹1,800 more for free shipping, otherwise ₹99 delivery applies.") computed by a tested helper |
| Checkout integrity | ✅ the basket is **normalised server-side** before pricing: repeated slugs merged into one line, quantity bounded to **1–999 per item** (larger values would overflow the `INTEGER` amount column), max 50 distinct lines, no missing slugs — and genuine bulk buyers are pointed at the quote flow |
| Order success + live verify | ✅ polling `/store/checkout/verify` |
| Track order + cancel | ✅ `/track-order`, `/store/service/track`, customer cancel; COD orders never show a phantom "payment confirmed" step; **timeline dates only the steps actually recorded** (`placed` = order date, `delivered` = `delivered_at`, `refunded` = `refunded_at`, intermediate steps undated) and the UI renders readable local times; refund outcome (auto/manual) persisted and flagged in admin |
| My orders by phone | ✅ `/my-orders` shows **item names and quantities**, pay mode, plus Reorder and WhatsApp help |
| GST invoice (print/PDF) | ✅ `/invoice/[receipt]` **server-rendered** (prints without waiting for JS); seller GSTIN + address from config, **buyer GSTIN**, item lines with HSN, **shipping line**, coupon line, **subtotal sent as the pre-GST taxable value** so the printed columns actually add up (`subtotal + CGST/SGST or IGST = grand total`, asserted by test and verified in rendered HTML), a **GST split with place of supply** (CGST+SGST intra-state, IGST inter-state, paise-exact), **amount in words** (lakh/crore), "prices inclusive of GST", "Reverse charge: No", an **Authorised Signatory** block, and a **field-level contract test** proving every key the page reads is actually sent |
| Buyer GSTIN validation | ✅ **structure + state code + mod-36 check character** verified on the server and mirrored in the checkout UI — a transcription typo is rejected instead of printing a tax invoice that can't be used for input credit; still optional for retail buyers |
| Delivery state + place of supply | ✅ checkout captures a **state (01–38 with names)** from `GET /store/states`, validated server-side and stored on the order; the invoice API **sends `customer.state`/`stateCode`** (guarded by a nested-field contract test) and the invoice uses it as the **place of supply for B2C orders** (GSTIN wins when present), printing the state under the address. If the state list can't load, the picker is **not required** and nothing is submitted — a failed lookup must never block checkout |
| 404 + error handling | ✅ branded `not-found.js` (search, categories, WhatsApp — not a dead end) with a **real 404 status** for unknown routes *and* for unknown product / category / subcategory slugs; `error.js` boundary offers retry/home/browse instead of a blank app-error screen. (The root `app/loading.js` boundary was removed: a root Suspense boundary made every dynamic `notFound()` stream a `200`, so a fake skeleton cost honest status codes.) |
| Policies: shipping/returns/warranty/privacy/terms/about/contact/EMI | ✅ 10 static pages incl. **cancellation policy**, all in the footer + sitemap |
| Cancellation (customer) | ✅ `/store/service/cancel` from Track Order for `pending` / `paid` / `cod_pending` only (not once shipped), restocks, refunds (gateway or flagged manual) and now **releases the coupon use** so a limited code isn't consumed by a cancelled order |
| Contact / support | ✅ contact form persisted + admin Messages tab; **WhatsApp deep links** from admin (messages, quotes, returns) and from customer order history |
| Returns / exchange (RMA) request | ✅ `/returns` form → `/store/service/returns` → admin Returns tab with status workflow; **customers can check their return status** by receipt + phone; `orders.delivered_at` is recorded on delivery and the **published 7-day window is enforced server-side** (day 7 inclusive, delivery-anchored with order date as fallback); **one open request per order** stops duplicate RMAs; a **"Can I still return this?" checker** answers eligibility *before* the form is filled |
| Newsletter | ✅ `/store/service/subscribe` + footer form; admin Messages tab lists subscribers and exports CSV |
| XML sitemap | ✅ `/sitemap.xml` includes home, policies, categories, every product **and every brand**; **never lists robots-blocked pages** (test enforces the two lists agree) |
| robots.txt | ✅ generated by `app/robots.js` from `NEXT_PUBLIC_SITE_URL` (private paths disallowed, sitemap link always correct); blocks `/invoice` too |
| SEO metadata | ✅ per-product/category/brand/content-page titles+descriptions+canonical+OG; Product JSON-LD with price, availability, **itemCondition**, HSN and **aggregateRating only when real reviews exist**; homepage **Organization + WebSite/SearchAction**; **BreadcrumbList + visible breadcrumbs on product, category and brand pages**; `NEXT_PUBLIC_SITE_URL` sets the base. `scripts/audit-pages.mjs` verifies the **assembled** head on 16 routes (canonical present/absolute/matching, unique titles, one `<h1>`, not `noindex`) and validates every JSON-LD block |
| Per-route metadata | ✅ all 11 client-rendered routes have metadata layouts: public pages (`/contact-us`, `/bulk-quote`) get title/description/**canonical that refuses to point at localhost**; private ones (cart, checkout, wishlist, my-orders, track-order, returns, order-success, invoice, admin) are `noindex, nofollow` |

## Hardening

| Control | Status |
|---|---|
| Response headers | ✅ `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, HSTS when served over https |
| Server fingerprint | ✅ `x-powered-by` disabled |
| Abuse limits | ✅ per-IP limit on public writes (`RATE_LIMIT_*`), separate admin throttle against token guessing (`ADMIN_RATE_LIMIT_*`), receipt-lookup limit (`LOOKUP_RATE_LIMIT_MAX`), and a **typeahead budget** (`SUGGEST_RATE_LIMIT_MAX`, default 120/min — suggest queries the DB per keystroke) while SEO reads (product listings) stay unmetered |
| Receipt privacy | ✅ invoice/track links use 64-bit random receipt IDs; guessable timestamps + 6 digits replaced |
| CORS | ✅ `FRONTEND_URL` allowlist (comma-separated); same-origin `/api` needs none |
| Admin access | ✅ token via `x-admin-token` on every admin route, compared in constant time |
| SQL | ✅ parameterised everywhere; sort/filter values allowlisted |
| Input validation | ✅ public writes clamp/validate: quote qty (1–100k), phone format, name/message/review lengths; **checkout customer block normalised** (phone → 10 digits, pincode 6, address ≤500) so orders stay trackable; admin statuses allowlisted; stock/prices bounded |
| Observability | ✅ every response carries `X-Request-Id` (honours a sane upstream id); 4xx/5xx JSON includes `requestId`, and 5xx logs are prefixed with it so a customer quote can be traced |
| SSR caching | ✅ short-TTL cache (`SSR_CACHE_TTL_MS`, default 10s) on server-rendered product/category/home fetches — measured 6 page views → 1 backend call, still revalidating after TTL |

## Accessibility & consistency

| Control | Status |
|---|---|
| Form labels | ✅ every storefront `<input>` has an accessible name (`aria-label`), not just placeholder text — **51 inputs labelled**, enforced by a test that fails on any new unlabelled input |
| Autofill (input purpose) | ✅ checkout declares `autocomplete` for name / phone / street-address / postal-code (plus `required` on the four delivery fields); contact, bulk-quote, returns, track-order, my-orders and the stock-alert email declare theirs too — WCAG 1.3.5, guarded by tests |
| Keyboard navigation | ✅ **"Skip to main content"** link (visible on focus), focusable `<main id="main-content">` target, labelled navigation landmark, `lang="en"` — enforced by a layout test |
| Search typeahead | ✅ full ARIA combobox pattern: `aria-expanded`, `aria-controls`, `aria-autocomplete`, **`aria-activedescendant` with stable option ids** (arrow-key highlight is announced), `aria-selected`; the empty state is a `status` region rather than a listbox |
| Async feedback | ✅ coupon/pincode/quote/contact/returns/tracking messages use live regions — `role="status"` for success, `role="alert"` for errors — so screen readers announce them |
| Single-source branding | ✅ store name, phone, email and GSTIN come from `lib/store.js` (`NEXT_PUBLIC_STORE_*`) and propagate to every page, the invoice letterhead and WhatsApp templates — a test fails on any hardcoded brand name (verified by building with a different name) |

## Needs your inputs (code slots ready)

| Item | What to provide |
|---|---|
| Real product photos | Placeholders exist and are auto-checked; replace with your shoot/vendor photos by overwriting `apps/storefront/public/images/<slug>.svg` (or edit `data/products.js` + rerun `scripts/gen-product-images.mjs`) |
| VPS + domain | Any Mumbai/Bangalore 4vCPU/8GB → `docs/VPS-DEPLOY.md` |
| Razorpay live keys | Dashboard → backend `.env`, webhook URL |
| OTP-SMS login | MSG91/equivalent key → account auth can be added on top of phone-based orders |
| Real product videos | Replace demo embed URLs in `apps/backend/data/products.js` with your own (YouTube/Vimeo embeds work today) |
| Email / SMS notifications | No mailer or SMS gateway is wired up, and no copy promises one (a test enforces this). Supply SMTP or MSG91 credentials to add order-confirmation emails/OTP login. |
| Seller GSTIN + phone/email | Set `NEXT_PUBLIC_STORE_GSTIN/PHONE/EMAIL` in `.env` (one place: `lib/store.js`) |
| Social preview image (og:image) | WhatsApp/Facebook don't render SVG, so supply a 1200×630 **PNG** (logo + tagline). Product pages currently share as text + link; the WhatsApp Share button is already live. |

## Tests

One command runs everything that works without Docker/Postgres:

```
node scripts/verify-all.mjs    # 6/6: backend suite, storefront suite, compose
                               # structure, production build, mojibake audit,
                               # unbacked-promise audit  (exit code gates deploys)
node scripts/self-audit.mjs    # after a build: fixture backend (real catalogue data)
                               # + built storefront + smoke + page audit + sitemap crawl, cleaned up
                               # automatically — the reproducible end-to-end check (3/3)
node scripts/smoke.mjs         # live routes, needs running servers (36/36 incl. four real 404s)
                               #   + scans visible text for ₹NaN / undefined / Invalid Date artefacts
node scripts/verify-clone.mjs  # clones the pushed repo fresh: 2 suites + audits + compose (5/5)

# Needs a running storefront + backend. Audits the assembled SEO surface, which no unit test
# sees: every JSON-LD block must parse, Product nodes must carry offers/price/currency/
# availability, BreadcrumbLists must be >= 2 items with 1..n positions, and the visible text
# must be free of ₹NaN/undefined/Invalid Date artefacts. Each page also needs exactly one
# <h1>, a canonical that matches its own route, a unique title, no accidental noindex, and
# every <img> must carry an alt attribute (empty alt="" is fine for decorative images).
node scripts/audit-pages.mjs http://localhost:3000 <product-slug> <category-slug> [brand]   # 17/17 pages
```

Last run against the pushed HEAD: `verify-all` **6/6** (298 backend, 112 storefront, build 28 routes),
`self-audit` **3/3** (36/36 routes, 17/17 pages, 74/74 sitemap URLs), `verify-clone` **5/5** on a fresh
clone of `BenitoJD/toolsvilla-clone`. **CI is green** on GitHub Actions (Ubuntu, Node 20): the same
pipeline — `verify-all` then the live `self-audit` — runs on every push to `main` and every PR.

Backend: `cd apps/backend && npm test` — 298 tests (pricing math, GST, EMI, catalog validity,
category taxonomy + tree counts, state list, page↔API field contracts (invoice, product, tracking, admin detail + reconcile inputs), **graceful shutdown (drain + hard deadline), production config audit**, **nginx routing/caching rules**, CI workflow shape, coupon expiry/usage caps, webhook state machine + signature (fails closed in production), LIKE escaping, CORS policy (no wildcard in production), status
transitions, refunds, readiness probe, frontend↔backend API contract (every storefront
call resolves to a mounted route), plus route-level integration tests against an
in-memory DB: checkout/stock, coupons, cancel, webhooks, quote conversion, admin guard,
invoice balance, returns workflow, stock alerts).

Storefront: `cd apps/storefront && npm test` — 112 tests (catalog filter/sort logic, cart
add/merge/clamp + reorder mapping + stock status, order money reconciliation, picking-list aggregation, GST-inclusive split, COD cap + shipping
mirrors, deals threshold/sorting, brand directory counts, recently-viewed de-dupe/cap,
canonical-URL guard, WhatsApp links (customer + share), TTL cache eviction/expiry,
JSON-LD builders, API base + server base resolution, misconfiguration guard, NaN-proof
self-healing storage, wishlist dedupe + stock, store contact config + wa.me links,
paise→rupee normalisation, readable API errors, video embed allowlist).

Build: `cd apps/storefront && npm run build` must compile all 29 routes.
Smoke: `BASE_URL=... node scripts/smoke.mjs` — 28 routes, expects 200 + real content.

Fresh-clone check (do this before trusting a deploy): clone into an empty dir, then
run the storefront suite (needs no install) and `apps/backend` install + suite.
Both must be green with zero setup beyond `git clone`.

Seed (`cd apps/backend && npm run seed`) is **repeatable**: it refreshes catalogue
content (names, prices, images, specs, videos) and coupon terms, but never overwrites
live `stock` or coupon `used_count`/`active`.
