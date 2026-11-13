import { STORE } from '../../lib/store';
import { absoluteUrl } from '../../lib/serverApi';
export const metadata = {
  title: `EMI Options | ${STORE.name}`,
  description:
    'Credit and debit card EMI plans, indicative monthly amounts and what to check before choosing a tenure.',
  alternates: { canonical: absoluteUrl('/emi-options') },
  openGraph: {
    title: `EMI Options | ${STORE.name}`,
    description: 'Credit and debit card EMI plans, indicative monthly amounts and what to check before choosing a tenure.',
    url: absoluteUrl('/emi-options'),
  },
};


export default function EmiOptions() {
  const rows = [
    { plan: '3 months', rate: 'No-cost on HDFC, ICICI, SBI cards', example: '₹10,000 → 3 × ₹3,334' },
    { plan: '6 months', rate: 'No-cost on most major cards', example: '₹10,000 → 6 × ₹1,667' },
    { plan: '9 months', rate: 'Low-cost, small interest may apply', example: '₹10,000 → 9 × ~₹1,150' },
    { plan: '12 months', rate: 'Standard EMI, bank interest applies', example: '₹10,000 → 12 × ~₹880' }
  ];
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">EMI Options</h1>
      <p className="text-sm text-gray-500 mt-1">Split any order above ₹2,999 into easy instalments via Razorpay.</p>
      <div className="card mt-5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="px-4 py-2">Plan</th>
              <th className="px-4 py-2">Interest</th>
              <th className="px-4 py-2">Example</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.plan} className="border-t">
                <td className="px-4 py-2 font-bold">{r.plan}</td>
                <td className="px-4 py-2">{r.rate}</td>
                <td className="px-4 py-2 text-gray-600">{r.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card p-5 mt-4 text-sm text-gray-700 space-y-2">
        <p><b>Cards:</b> All major credit cards + HDFC/ICICI/SBI debit cards. Select EMI on the Razorpay payment page after checkout.</p>
        <p><b>GST benefit:</b> Business buyers still get a full GST invoice on EMI orders for input tax credit.</p>
        <p><b>Cancellation:</b> EMI orders cancelled before dispatch get a full refund; the bank reverses the loan in 5–7 days.</p>
      </div>
    </div>
  );
}
