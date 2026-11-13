import { absoluteUrl } from '../../lib/serverApi';
import { STORE } from '../../lib/store';

export const metadata = {
  title: `Cancellation Policy | ${STORE.name}`,
  description:
    'Orders can be cancelled free of charge any time before dispatch. See how to cancel, when refunds are issued and what happens after a parcel ships.',
  alternates: { canonical: absoluteUrl('/cancellation-policy') },
  openGraph: {
    title: `Cancellation Policy | ${STORE.name}`,
    description: 'Cancel before dispatch for a full refund — refunds reach the source account in 3–5 working days.',
    url: absoluteUrl('/cancellation-policy'),
  },
};

export default function CancellationPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Cancellation Policy</h1>
      <div className="card p-6 mt-5 space-y-3 text-sm text-gray-700">
        <p>
          <b>Before dispatch — free cancellation.</b> You can cancel any order while it is still
          being prepared (status <i>Pending</i>, <i>Paid</i> or <i>Cash on Delivery pending</i>).
          No fee is charged and any amount already paid is refunded in full.
        </p>
        <p>
          <b>How to cancel.</b> Open <a href="/track-order" className="text-[#F97316] font-bold underline">Track Order</a>,
          enter your receipt number and the phone used at checkout, and use the <i>Cancel order</i>
          button. You can also{' '}
          <a href="/contact-us" className="text-[#F97316] font-bold underline">contact us</a> with your
          receipt number — we action it the same day during working hours.
        </p>
        <p>
          <b>After dispatch.</b> Once an order is marked <i>Shipped</i> it cannot be cancelled,
          because the parcel is already with the courier. You can still refuse delivery or raise a
          return after it arrives — see the{' '}
          <a href="/returns-policy" className="text-[#F97316] font-bold underline">returns policy</a>{' '}
          (7 days from delivery).
        </p>
        <p>
          <b>Refund timing.</b> UPI/card/net-banking refunds are processed to the original payment
          method within 3–5 working days of cancellation. Cash-on-Delivery orders that were never
          paid need no refund; if a COD order was prepaid for any reason, we refund to your bank
          account within 5–7 working days.
        </p>
        <p>
          <b>Stock and coupons.</b> Cancelling releases the reserved stock immediately, so the item
          becomes available to other buyers. A coupon used on a cancelled order is released and can
          be used again while it is still valid.
        </p>
        <p>
          <b>If we cancel your order.</b> Rarely, an item may be out of stock or damaged before
          dispatch. In that case we cancel and refund in full, and tell you why — we never swap an
          order for a substitute without asking.
        </p>
        <p className="text-xs text-gray-500">
          Questions about a cancellation? WhatsApp {STORE.phoneDisplay} or email {STORE.email} with
          your receipt number.
        </p>
      </div>
    </div>
  );
}
