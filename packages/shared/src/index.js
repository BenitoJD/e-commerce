// Shared helpers: INR paise <-> rupees, GST, EMI
function paiseToINR(paise) {
  return (paise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}
function inrToPaise(inr) {
  return Math.round(Number(inr) * 100);
}
function discountPct(mrpPaise, pricePaise) {
  if (!mrpPaise || mrpPaise <= pricePaise) return 0;
  return Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100);
}
function emiPerMonth(pricePaise, months) {
  // flat 0% display EMI (gateway interest varies); show base split
  return Math.ceil(pricePaise / months);
}
function gstSplit(amountPaise, gstRate = 18) {
  // returns {base, gst} for inclusive price
  const base = Math.round(amountPaise * 100 / (100 + gstRate));
  return { base, gst: amountPaise - base, rate: gstRate };
}
module.exports = { paiseToINR, inrToPaise, discountPct, emiPerMonth, gstSplit };
