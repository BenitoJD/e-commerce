import { STORE } from '../../../lib/store';

export const metadata = { title: `Choose a new password | ${STORE.name}`, robots: { index: false, follow: false } };

export default function ResetLayout({ children }) { return children; }
