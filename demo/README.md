# Storefront demo

| File | What it is |
|---|---|
| `ecommerce-demo.mp4` | 74-second 1080p walkthrough with burned-in scene captions, a visible cursor, intro and outro |
| `ecommerce-demo-720p.mp4` | Smaller share copy (approx. 4 MB) |
| `poster.jpg` | 1920×1080 opening frame for a thumbnail or email preview |

## Walkthrough

1. Opening title, *Made to work. Made to stay.*
2. Homepage, the collection, weekly edit and brand story
3. Power Tools category, real product photography and filters
4. Product page, image, pricing, EMI, delivery check, specifications
5. Cart and guest checkout
6. Order confirmation and GST tax invoice
7. Brand directory, search and A–Z filtering
8. Admin overview
9. The people behind the order
10. Closing title

## Re-recording

With the storefront on `:3000` and API on `:9000`:

```bash
node scripts/record-demo.mjs
```

The script uses Playwright, places a demo COD order (`Aarav Sharma`, clearly labelled as
sample data), clears local cart/account state first, records 1920×1080 WebM, then
transcodes to H.264 MP4. It does not reveal the admin token: the token is seeded into
localStorage and appears only as masked dots on screen.

**Before sharing outside the demo:** replace the sample phone/email/GSTIN in
`apps/storefront/.env.local` and `apps/backend/.env`, and replace the sample team
names/photos if they should be real staff.
