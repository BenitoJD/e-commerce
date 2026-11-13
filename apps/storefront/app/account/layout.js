import { STORE } from '../../lib/store';

export const metadata = { title: `Your Account | ${STORE.name}`, robots: { index: false, follow: false } };

export default function Layout({ children }) { return children; }
