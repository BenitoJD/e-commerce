# Feature Parity vs toolsvilla.com

Comparison of the live Toolsvilla store against this clone. Last verified: wave 55 (fresh-clone verification; released catalog files).

## Storefront

| Live feature | Clone status |
|---|---|
| Homepage hero, categories, brands, bestsellers | ✅ `app/page.js` + deals/brand/recently-viewed strips |
| Mega-menu / category nav | ✅ header category nav |
| Search with suggestions | ✅ `/store/search` + header search |
| Category listing: brand/price/discount/sort filters | ✅ `app/category/[slug]` |
| Product gallery, specs, EMI plans | ✅ `app/product/[slug]` (gallery + EMI 3/6/9/12) |
| Product videos | ✅ `videos[]` column + seed data + embedded player on product page (YouTube/Vimeo, host-allowlisted) |
| Reviews + ratings, Q&A | ✅ `/store/engage/*` + product page UI |
| Bulk quote / B2B | ✅ `/bulk-quote`, `/bulk-orders`, admin pipeline + one-click convert-to-order (agreed price, stock reserved) |
| Pincode delivery check | ✅ `/store/service/pincode` + product page checker |
| Wishlist | ✅ localStorage + `/wishlist` |
| Recently viewed | ✅ `tw_recent` strip on homepage |
| Deals of the day + countdown | ✅ `/deals` |
| Brand pages | ✅ `/brands`, `/brand/[name]` |
| Cart + coupons + GST note | ✅ case-insensitive validate + server-side breakdown (`coupon_code`/`discount_paise`); admin Coupons tab; seeded WELCOME10/TOOLS15 |
| Checkout (UPI/cards/netbanking/EMI/COD) | ✅ Razorpay + COD + mock fallback |
| Order success + live verify | ✅ polling `/store/checkout/verify` |
| Track order + cancel | ✅ `/track-order`, `/store/service/track`, customer cancel |
| My orders by phone | ✅ `/my-orders` |
| GST invoice (print/PDF) | ✅ `/invoice/[receipt]` (browser print → PDF) |
| Policies: shipping/returns/warranty/privacy/terms/about/contact/EMI | ✅ 9 static pages + footer |
| Newsletter | ✅ `/store/service/subscribe` + footer form |
| XML sitemap | ✅ `/sitemap.xml` (backend) |
| SEO metadata | ✅ per-page metadata in layout/pages |

## Needs your inputs (code slots ready)

| Item | What to provide |
|---|---|
| Real product photos | Vendor feeds/shoot → `apps/backend/public/images/` + seed `images[]` |
| VPS + domain | Any Mumbai/Bangalore 4vCPU/8GB → `docs/VPS-DEPLOY.md` |
| Razorpay live keys | Dashboard → backend `.env`, webhook URL |
| OTP-SMS login | MSG91/equivalent key → account auth can be added on top of phone-based orders |
| Real product videos | Replace demo embed URLs in `apps/backend/data/products.js` with your own (YouTube/Vimeo embeds work today) |
| Seller GSTIN + phone/email | Set `NEXT_PUBLIC_STORE_GSTIN/PHONE/EMAIL` in `.env` (one place: `lib/store.js`) |

## Tests

Backend: `cd apps/backend && npm test` — 53 tests (pricing math, GST, EMI, catalog validity,
webhook state machine + signature, LIKE escaping, status transitions, refunds, plus
route-level integration tests against an in-memory DB: checkout/stock, coupons, cancel,
webhooks, quote conversion, admin guard, invoice balance).

Storefront: `cd apps/storefront && npm test` — 23 tests (cart add/merge/clamp, NaN-proof
self-healing storage, wishlist dedupe + stock, store contact config + wa.me links,
paise→rupee normalisation, readable API errors, video embed allowlist).

Build: `cd apps/storefront && npm run build` must compile all 23 routes.

Fresh-clone check (do this before trusting a deploy): clone into an empty dir, then
run the storefront suite (needs no install) and `apps/backend` install + suite.
Both must be green with zero setup beyond `git clone`.
