import { absoluteUrl } from '../../lib/serverApi';
import { STORE } from '../../lib/store';

export const metadata = {
  title: `Bulk Orders (B2B) | ${STORE.name}`,
  description: 'Wholesale slab pricing on 5+ units, GST invoice for input tax credit, freight support and a dedicated account manager for sites, farms, factories and resellers.',
  alternates: { canonical: absoluteUrl('/bulk-orders') },
  openGraph: {
    title: `Bulk Orders (B2B) | ${STORE.name}`,
    description: 'Wholesale pricing on 5+ units with GST invoice and freight support.',
    url: absoluteUrl('/bulk-orders'),
  },
};

export default function BulkOrders() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">Bulk Orders (B2B)</h1>
      <p className="text-sm text-gray-500 mt-1">Sites, farms, factories, resellers & government buyers welcome.</p>
      <div className="card p-6 mt-5 space-y-3 text-sm text-gray-700">
        <p><b>What you get:</b> Wholesale slab pricing on 5+ units, GST invoice for full input tax credit, freight/transport support and a dedicated account manager.</p>
        <p><b>How it works:</b> 1) Tell us products + quantities → 2) Get a formal quote in 24 hrs (valid 7 days) → 3) Pay via UPI/card/bank transfer → 4) Dispatched with GST invoice.</p>
        <p><b>Categories:</b> Power tools, motors & pumps, agri sprayers, welders, pressure washers — mixed Brand lots OK.</p>
        <a href="/bulk-quote" className="btn-primary inline-block">Get a Bulk Quote →</a>
      </div>
    </div>
  );
}
