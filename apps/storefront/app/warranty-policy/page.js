import { absoluteUrl } from '../../lib/serverApi';
import { STORE } from '../../lib/store';
import { canonicalUrl } from '../../lib/seo';

export const metadata = {
  title: `Warranty Policy | ${STORE.name}`,
  description:
    'Manufacturer warranty terms, what the invoice proves and how claims are handled.',
  alternates: { canonical: canonicalUrl('/warranty-policy') },
  openGraph: {
    title: `Warranty Policy | ${STORE.name}`,
    description: 'Manufacturer warranty terms, what the invoice proves and how claims are handled.',
    url: absoluteUrl('/warranty-policy'),
  },
};


export default function WarrantyPolicy() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Warranty Policy</h1>
      <div className="card p-6 mt-5 space-y-3 text-sm text-gray-700">
        <p><b>Brand warranty:</b> Every product carries the official brand warranty (typically 6–12 months, motors up to 24 months), see the Specs table on each product page.</p>
        <p><b>How to claim:</b> Keep your GST invoice + serial number. Raise a claim at {STORE.email} or WhatsApp {STORE.phoneDisplay}; we route it to the nearest brand service centre.</p>
        <p><b>Covered:</b> Manufacturing defects, motor winding failure, faulty switches/chucks under normal use.</p>
        <p><b>Not covered:</b> Physical damage, overloading, unauthorised repair, wear consumables (carbon brushes, blades, belts), voltage-fluctuation damage without stabiliser.</p>
        <p><b>DOA:</b> Dead-on-arrival within 7 days = free replacement after a short video diagnosis.</p>
      </div>
    </div>
  );
}
