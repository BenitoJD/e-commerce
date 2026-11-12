import { STORE } from '../../lib/store';
import { canonicalUrl } from '../../lib/seo';

// Title/description for a client-rendered route (client components cannot export metadata).
export const metadata = {
  title: `Bulk Quote — wholesale pricing on 5+ units | ${STORE.name}`,
  description: 'Request wholesale pricing on power tools, motors, pumps and machinery. GST invoice, freight support across India, quotes within 24 hours.',
  alternates: { canonical: canonicalUrl('/bulk-quote') },
};

// Metadata-only layout: pass children through untouched.
export default function Layout({ children }) {
  return children;
}
