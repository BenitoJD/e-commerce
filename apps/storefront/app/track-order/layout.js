import { STORE } from '../../lib/store';

// Title/description for a client-rendered route (client components cannot export metadata).
export const metadata = {
  title: `Track Your Order | ${STORE.name}`,
  description: 'Track an order with your receipt ID and phone number.',
  robots: { index: false, follow: false },
};

// Metadata-only layout: pass children through untouched.
export default function Layout({ children }) {
  return children;
}
