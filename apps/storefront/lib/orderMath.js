// Order money reconciliation for the admin console.
//
// An operator answering "why was I charged ₹X?" needs the same breakdown the invoice shows:
// items − discount + shipping = total. Keeping it pure means the arithmetic is testable
// without a browser, and a mismatch is surfaced instead of hidden.
export function sumLinePaise(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, it) => {
    if (!it) return sum;
    const qty = Number(it.qty) || 0;
    const unit = Number(it.unitPaise != null ? it.unitPaise : it.unit_price_paise) || 0;
    const line = Number(it.linePaise != null ? it.linePaise : unit * qty) || 0;
    return sum + line;
  }, 0);
}

export function reconcileOrder(order = {}) {
  const subtotalPaise = sumLinePaise(order.items);
  const discountPaise = Number(order.discountPaise) || 0;
  const shippingPaise = Number(order.shippingPaise) || 0;
  const totalPaise = Number(order.amountPaise) || 0;
  const expectedPaise = subtotalPaise - discountPaise + shippingPaise;
  return {
    subtotalPaise,
    discountPaise,
    shippingPaise,
    totalPaise,
    expectedPaise,
    // Small orders may legitimately differ if a historical order predates shipping lines.
    matches: expectedPaise === totalPaise,
    differencePaise: totalPaise - expectedPaise,
  };
}
