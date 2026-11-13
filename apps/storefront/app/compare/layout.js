export const metadata = {
  title: 'Compare products',
  description: 'Compare tools side by side: price, MRP, availability, HSN and full specifications.',
  // A comparison is per-visitor state from localStorage, so it must never be indexed.
  robots: { index: false, follow: true },
};

export default function Layout({ children }) {
  return children;
}
