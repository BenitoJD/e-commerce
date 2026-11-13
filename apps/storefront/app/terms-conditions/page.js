import { STORE } from '../../lib/store';
import { absoluteUrl } from '../../lib/serverApi';
import { canonicalUrl } from '../../lib/seo';
export const metadata = {
  title: `Terms & Conditions | ${STORE.name}`,
  description:
    'The terms that apply when you order from this store: pricing, GST, delivery, cancellations and liability.',
  alternates: { canonical: canonicalUrl('/terms-conditions') },
  openGraph: {
    title: `Terms & Conditions | ${STORE.name}`,
    description: 'The terms that apply when you order from this store: pricing, GST, delivery, cancellations and liability.',
    url: absoluteUrl('/terms-conditions'),
  },
};


export default function Terms() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Terms & Conditions</h1>
      <div className="card p-6 mt-5 space-y-3 text-sm text-gray-700">
        <p><b>Pricing:</b> All prices are in INR, inclusive of GST unless noted. Discounts/coupons apply per published rules; one coupon per order.</p>
        <p><b>Orders:</b> An order is confirmed after payment authorisation (or COD confirmation call). We may cancel suspected-fraud or unserviceable-pincode orders with full refund.</p>
        <p><b>EMI:</b> EMI conversion is between you and your card issuer via Razorpay; any interest/processing fee is as shown at checkout.</p>
        <p><b>Bulk quotes:</b> Quotes via /bulk-quote are valid 7 days and exclude freight unless stated.</p>
        <p><b>Liability:</b> Max liability per order is the order value. Disputes are subject to New Delhi jurisdiction.</p>
      </div>
    </div>
  );
}
