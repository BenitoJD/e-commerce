import { STORE } from '../../lib/store';
import { absoluteUrl } from '../../lib/serverApi';
export const metadata = {
  title: `Shipping Policy | ${STORE.name}`,
  description:
    'Dispatch timelines, delivery partners, freight charges and serviceable pincodes for pan-India delivery.',
  alternates: { canonical: absoluteUrl('/shipping-policy') },
  openGraph: {
    title: `Shipping Policy | ${STORE.name}`,
    description: 'Dispatch timelines, delivery partners, freight charges and serviceable pincodes for pan-India delivery.',
    url: absoluteUrl('/shipping-policy'),
  },
};


export default function ShippingPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Shipping Policy</h1>
      <div className="card p-6 mt-5 space-y-3 text-sm text-gray-700">
        <p><b>Dispatch:</b> Orders placed before 3pm ship the same working day from our nearest warehouse. Bulk/5+ unit orders may take 1–2 extra days for freight packing.</p>
        <p><b>Delivery time:</b> 3–7 working days across India depending on zone (metro 2–4 days, remote 5–7 days). Check your pincode on any product page for an ETA.</p>
        <p><b>Charges:</b> Standard shipping ₹99; free shipping on prepaid orders above ₹4,999. Freight for heavy machinery (pumps, welders 25kg+) is calculated at checkout.</p>
        <p><b>COD:</b> Cash on Delivery available on eligible pincodes up to ₹50,000. Please keep exact change ready.</p>
        <p><b>Tracking:</b> Track any order from <a href="/track-order" className="text-[#F97316] font-bold underline">Track Order</a> using your receipt ID + phone.</p>
        <p><b>GST invoice:</b> A GST invoice is emailed for every order — share your GSTIN at checkout for input tax credit.</p>
      </div>
    </div>
  );
}
