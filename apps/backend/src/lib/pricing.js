// Pure pricing helpers (zero dependencies).
function applyCoupon(amountPaise, coupon) {
  const amount = Math.floor(Number(amountPaise) || 0);
  if (amount <= 0) {
    return { discountPaise: 0, finalPaise: Math.max(0, amount), reason: 'Invalid amount' };
  }
  if (!coupon) {
    return { discountPaise: 0, finalPaise: amount, reason: 'No coupon' };
  }
  if (coupon.active === false) {
    return { discountPaise: 0, finalPaise: amount, reason: 'Coupon is inactive' };
  }
  const pct = Number(coupon.pct_off) || 0;
  if (pct <= 0) {
    return { discountPaise: 0, finalPaise: amount, reason: 'No discount' };
  }
  const minOrder = Number(coupon.min_order_paise) || 0;
  if (amount < minOrder) {
    return { discountPaise: 0, finalPaise: amount, reason: 'Minimum order not met' };
  }
  let discount = Math.floor((amount * pct) / 100);
  const maxDiscount = Number(coupon.max_discount_paise) || 0;
  if (maxDiscount > 0) discount = Math.min(discount, maxDiscount);
  discount = Math.max(0, Math.min(discount, amount));
  return { discountPaise: discount, finalPaise: amount - discount, reason: '' };
}

function gstSplit(amountPaise, gstRate) {
  const rate = gstRate === undefined || gstRate === null ? 18 : Number(gstRate);
  const amount = Math.round(Number(amountPaise) || 0);
  const base = Math.round((amount * 100) / (100 + rate));
  return { base, gst: amount - base, rate };
}

function emiPerMonth(pricePaise, months) {
  const price = Math.round(Number(pricePaise) || 0);
  const n = parseInt(months, 10);
  if (!Number.isInteger(n) || n <= 0) return 0;
  return Math.ceil(price / n);
}

function discountPct(mrpPaise, pricePaise) {
  const mrp = Number(mrpPaise) || 0;
  const price = Number(pricePaise) || 0;
  if (!mrp || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

function paiseToINR(paise) {
  return (Number(paise) / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
}

module.exports = { applyCoupon, gstSplit, emiPerMonth, discountPct, paiseToINR };
