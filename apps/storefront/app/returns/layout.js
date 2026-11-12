import { STORE } from '../../lib/store';

// Title/description for a client-rendered route (client components cannot export metadata).
export const metadata = {
  title: `Return or Exchange | ${STORE.name}`,
  description: 'File a return or exchange request and check its status.',
  robots: { index: false, follow: false },
};

// Metadata-only layout: pass children through untouched.
export default function Layout({ children }) {
  return children;
}
