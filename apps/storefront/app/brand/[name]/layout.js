import { absoluteUrl } from '../../../lib/serverApi';
import { STORE } from '../../../lib/store';

export async function generateMetadata({ params }) {
  const name = decodeURIComponent(params.name || '');
  const title = `${name} Products — Buy Online at ${STORE.name}`;
  const description = `Genuine ${name} tools and equipment with GST invoice, warranty support, EMI and pan-India delivery at ${STORE.name}.`;
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(`/brand/${encodeURIComponent(name)}`) },
    openGraph: { title, description, url: absoluteUrl(`/brand/${encodeURIComponent(name)}`) },
  };
}

export default function BrandLayout({ children }) {
  return children;
}
