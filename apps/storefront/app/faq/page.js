import { STORE, waLink } from '../../lib/store';
import { absoluteUrl } from '../../lib/serverApi';
import { canonicalUrl } from '../../lib/seo';

export const metadata = {
  title: `Frequently Asked Questions | ${STORE.name}`,
  description: `Answers on delivery times, COD limits, GST invoices, EMI, returns, warranty, bulk orders and payments at ${STORE.name}.`,
  alternates: { canonical: canonicalUrl('/faq') },
  openGraph: { title: `FAQ | ${STORE.name}`, url: absoluteUrl('/faq') },
};

const FAQS = [
  {
    q: 'How long does delivery take?',
    a: 'In-stock orders ship within 1–2 working days. Delivery is usually 3–7 working days depending on your pincode; remote areas can take a little longer. You can check an estimated date on any product page with the pincode checker.',
  },
  {
    q: 'Is Cash on Delivery available?',
    a: 'Yes, up to ₹20,000 per order. High-value machinery must be prepaid by UPI, card, netbanking or EMI. The checkout shows the COD option automatically when your cart qualifies.',
  },
  {
    q: 'Do you provide a GST invoice?',
    a: 'Every order gets a GST invoice. Business buyers can add their GSTIN at checkout and the invoice will print it with the correct place of supply (CGST+SGST for intra-state, IGST for inter-state). Download it any time from the order success page, My Orders or the invoice link.',
  },
  {
    q: 'Which payment methods do you accept?',
    a: 'UPI, credit/debit cards, netbanking and EMI through Razorpay, plus Cash on Delivery on eligible orders. All online payments are processed on Razorpay’s secure checkout; we never store card details.',
  },
  {
    q: 'What is the return and exchange policy?',
    a: 'You can request a return or exchange within 7 days of delivery for unused items in original packaging. Raise it from the Returns page with your receipt and phone number. Once approved, our team arranges pickup; refunds reach the source in 3–5 working days after inspection.',
  },
  {
    q: 'Can I cancel an order?',
    a: 'Yes — before it ships. Open Track Order with your receipt and phone, then choose Cancel order. Paid orders are refunded automatically when the gateway allows it, otherwise our team processes the refund manually.',
  },
  {
    q: 'Is there a warranty on tools?',
    a: 'All products carry the manufacturer’s warranty, typically 6–12 months. The warranty card ships with the unit. For service, contact us with your invoice number and we will connect you with the brand’s service centre.',
  },
  {
    q: 'Do you offer EMI?',
    a: 'Yes. EMI is available on eligible credit and debit cards for 3, 6, 9 and 12 months through Razorpay. The product page shows indicative monthly amounts; the exact plan is shown inside the payment window.',
  },
  {
    q: 'Can I buy in bulk for my factory or site?',
    a: 'Yes. Use the Bulk Quote form for 5+ units and our team will send slab pricing within 24 hours. Bulk orders receive a GST invoice, freight support and a dedicated account manager.',
  },
  {
    q: 'Do I need an account to order?',
    a: 'No — guest checkout is always available. Creating an account lets you save addresses, reuse them at checkout and see your full order history in one place. Guest orders can be looked up from My Orders after verifying your phone number.',
  },
  {
    q: 'How do I track my order?',
    a: 'Open Track Order, enter the receipt ID from your confirmation and the phone number used at checkout. The page shows the live status and cancellation option until the order ships.',
  },
  {
    q: 'What if a product arrives damaged?',
    a: 'Report it within 48 hours through the Returns page (reason: damaged) with a photo available if requested. Keep the packaging until the claim is resolved — we arrange pickup and a replacement or refund after inspection.',
  },
];

export default function FaqPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="text-3xl font-extrabold">Frequently asked questions</h1>
      <p className="text-sm text-gray-500 mt-1">
        Delivery, payments, GST invoices, returns and bulk orders. Still stuck?{' '}
        <a href="/contact-us" className="text-[#F97316] font-bold underline">Contact us</a> or{' '}
        <a href={waLink('Hi, I have a question about an order')} className="text-green-700 font-bold underline">WhatsApp</a>.
      </p>
      <div className="mt-6 space-y-3">
        {FAQS.map((f, i) => (
          <details key={f.q} className="card p-4" open={i === 0}>
            <summary className="font-bold cursor-pointer">{f.q}</summary>
            <p className="text-sm text-gray-700 mt-2">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
