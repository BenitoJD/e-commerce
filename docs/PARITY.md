# Feature Parity vs toolsvilla.com

Comparison of the live Toolsvilla store against this clone. Last verified: wave 27 (dropped unused Meilisearch, validated).

## Storefront

| Live feature | Clone status |
|---|---|
| Homepage hero, categories, brands, bestsellers | ✅ `app/page.js` + deals/brand/recently-viewed strips |
| Mega-menu / category nav | ✅ header category nav |
| Search with suggestions | ✅ `/store/search` + header search |
| Category listing: brand/price/discount/sort filters | ✅ `app/category/[slug]` |
| Product gallery, specs, EMI plans | ✅ `app/product/[slug]` (gallery + EMI 3/6/9/12) |
| Product videos | ⚠️ schema supports `images[]`; no video player yet (add `videos[]` when you have MP4s) |
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
| Product videos | MP4 URLs → extend gallery |
| Seller GSTIN + phone/email | Set `NEXT_PUBLIC_STORE_GSTIN/PHONE/EMAIL` in `.env` (one place: `lib/store.js`) |

## Tests

`cd apps/backend && node --test <test files>` — 16/16 (pricing math, GST, EMI, catalog validity).
Use explicit file args: directory-form `node --test <dir>` fails on the bundled Node 24 runtime.
