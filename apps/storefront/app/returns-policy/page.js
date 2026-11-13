import { absoluteUrl } from '../../lib/serverApi';
import { STORE } from '../../lib/store';
import { canonicalUrl } from '../../lib/seo';

export const metadata = {
  title: `Returns Policy | ${STORE.name}`,
  description:
    'The 7-day return window, what qualifies, how to raise an RMA and when refunds are issued.',
  alternates: { canonical: canonicalUrl('/returns-policy') },
  openGraph: {
    title: `Returns Policy | ${STORE.name}`,
    description: 'The 7-day return window, what qualifies, how to raise an RMA and when refunds are issued.',
    url: absoluteUrl('/returns-policy'),
  },
};


export default function ReturnsPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Returns & Refunds Policy</h1>
      <div className="card p-6 mt-5 space-y-3 text-sm text-gray-700">
        <p><b>7-day easy returns:</b> Unused products in original packing can be returned within 7 days of delivery. Electricals must not be wired/installed.</p>
        <p><b>Damaged / wrong item:</b> Share an unboxing video + photos within 48 hours at {STORE.email} for free replacement pickup.</p>
        <p><b>Non-returnable:</b> Consumables (blades, bits, oils), custom-cut cables and GST-billed B2B bulk lots once accepted at delivery.</p>
        <p><b>Refunds:</b> UPI/card/EMI refunds go to source in 3–5 working days after QC; COD refunds via bank transfer within 5–7 days.</p>
        <p><b>Shipping cost:</b> Return shipping is free for our error; ₹149 reverse-pickup otherwise, adjusted in refund.</p>
      </div>
      <a href="/returns" className="btn-primary inline-block mt-4">File a return request →</a>
    </div>
  );
}
