import { STORE } from '../../lib/store';
import { canonicalUrl } from '../../lib/seo';

// Title/description for a client-rendered route (client components cannot export metadata).
export const metadata = {
  title: `Contact Us — support & bulk enquiries | ${STORE.name}`,
  description: `Talk to the ${STORE.name} team about orders, returns, warranty or bulk machinery enquiries. WhatsApp, phone and email support.`,
  alternates: { canonical: canonicalUrl('/contact-us') },
};

// Metadata-only layout: pass children through untouched.
export default function Layout({ children }) {
  return children;
}
