import { STORE } from '../../lib/store';

// Title/description for a client-rendered route (client components cannot export metadata).
export const metadata = {
  title: `Admin Console | ${STORE.name}`,
  description: 'Store administration.',
  robots: { index: false, follow: false },
};

// Metadata-only layout: pass children through untouched.
export default function Layout({ children }) {
  return children;
}
