// GST tax presentation for invoices.
//
// A compliant Indian invoice shows either CGST + SGST (supply within one state) or IGST
// (inter-state), plus the place of supply. This store's prices are GST-inclusive, so the
// tax amount already exists — what was missing was the split and the place of supply.
//
// When the buyer supplies a GSTIN we know their state from its first two digits. When they
// don't (most B2C sales), we fall back to the seller's own state, which is what a B2C
// invoice from a single-location seller gets.

const STATE_NAMES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman & Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh',
};

export function stateCodeOf(gstin) {
  const s = String(gstin || '').replace(/[\s-]/g, '').toUpperCase();
  if (!/^[0-9]{2}/.test(s)) return null;
  const code = s.slice(0, 2);
  return STATE_NAMES[code] ? code : null;
}

export function stateName(code) {
  return STATE_NAMES[String(code || '')] || '';
}

// Rounding must not lose paise: the two halves always add back to the total tax.
export function splitTax(gstPaise, { sellerGstin = '', sellerStateCode = '', buyerGstin = '', rate = 18 } = {}) {
  const total = Math.max(0, Math.round(Number(gstPaise) || 0));
  const sellerState = stateCodeOf(sellerGstin) || (STATE_NAMES[String(sellerStateCode || '')] ? String(sellerStateCode) : null);
  const buyerState = stateCodeOf(buyerGstin);
  const interState = Boolean(sellerState && buyerState && sellerState !== buyerState);
  const cgstPaise = interState ? 0 : Math.floor(total / 2);
  const sgstPaise = interState ? 0 : total - cgstPaise;
  const igstPaise = interState ? total : 0;

  return {
    kind: interState ? 'inter' : 'intra',
    rate,
    placeOfSupplyCode: buyerState || sellerState || null,
    placeOfSupply: stateName(buyerState || sellerState),
    cgstPaise,
    sgstPaise,
    igstPaise,
    halfRate: rate / 2,
    totalPaise: total,
    // True when we assumed intra-state because the buyer gave no GSTIN.
    assumed: !buyerState,
  };
}
