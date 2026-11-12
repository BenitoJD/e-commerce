import { STORE } from '../../../lib/store';

// Invoice pages are receipt-scoped and private; title fixed, never indexed.
export const metadata = {
  title: `Invoice | ${STORE.name}`,
  description: 'Printable GST invoice for your order.',
  robots: { index: false, follow: false },
};

// Metadata-only layout: pass children through untouched.
export default function Layout({ children }) {
  return children;
}
