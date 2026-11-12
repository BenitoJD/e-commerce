// Default coupon codes seeded on fresh installs (idempotent ON CONFLICT DO NOTHING).
// Amounts in paise. WELCOME10: 10% up to Rs 500, min order Rs 999.
// TOOLS15: 15% up to Rs 1,500, min order Rs 4,999.
module.exports = [
  { code: 'WELCOME10', pct_off: 10, max_discount_paise: 50000, min_order_paise: 99900, active: true },
  { code: 'TOOLS15', pct_off: 15, max_discount_paise: 150000, min_order_paise: 499900, active: true },
];
