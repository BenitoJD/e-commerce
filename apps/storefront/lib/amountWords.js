// Indian-format amount in words, as printed on every invoice: "Rupees One Thousand One
// Hundred Eighty Only". Uses the lakh/crore grouping Indians actually read, not millions.
const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t} ${o}` : t;
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (!h) return twoDigits(rest);
  return rest ? `${ONES[h]} Hundred ${twoDigits(rest)}` : `${ONES[h]} Hundred`;
}

// Splits into crore / lakh / thousand / hundred / units (Indian grouping).
export function numberToIndianWords(num) {
  let n = Math.floor(Math.abs(Number(num) || 0));
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${numberToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(' ');
}

export function paiseToWords(paise) {
  const total = Math.max(0, Math.round(Number(paise) || 0));
  const rupees = Math.floor(total / 100);
  const paisePart = total % 100;
  // Indian invoices write "Rupees … Only" for every amount, including one rupee.
  const rupeeWords = `Rupees ${numberToIndianWords(rupees)}`;
  if (!paisePart) return `${rupeeWords} Only`;
  return `${rupeeWords} and ${numberToIndianWords(paisePart)} ${paisePart === 1 ? 'Paisa' : 'Paise'} Only`;
}
