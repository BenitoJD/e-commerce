import { STORE } from '../../lib/store';

export const metadata = { title: `Create your account | ${STORE.name}`, robots: { index: false, follow: false } };

export default function Layout({ children }) { return children; }
