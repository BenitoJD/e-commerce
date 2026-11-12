// GST helpers for the storefront. Listed prices are GST-inclusive, which is the norm
// in Indian retail; the invoice and checkout must therefore *split out* the tax rather
// than add it on top. Kept identical to the backend invoice formula
// (base = round(total * 100 / (100 + rate))).
export function gstInclusiveSplit(totalRupees, rate = 18) {
  const totalPaise = Math.round((Number(totalRupees) || 0) * 100);
  if (totalPaise <= 0) return { totalPaise: 0, basePaise: 0, gstPaise: 0, rate };
  const safeRate = Number.isFinite(Number(rate)) && Number(rate) > 0 ? Number(rate) : 18;
  const basePaise = Math.round((totalPaise * 100) / (100 + safeRate));
  return { totalPaise, basePaise, gstPaise: totalPaise - basePaise, rate: safeRate };
}

export function formatInr(rupees) {
  return `₹${(Number(rupees) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
