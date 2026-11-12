import { STORE } from '../../lib/store';

// Title/description for a client-rendered route (client components cannot export metadata).
export const metadata = {
  title: `Checkout | ${STORE.name}`,
  description: 'Secure checkout with UPI, cards, EMI or cash on delivery.',
  robots: { index: false, follow: false },
};

// Metadata-only layout: pass children through untouched.
export default function Layout({ children }) {
  return children;
}
