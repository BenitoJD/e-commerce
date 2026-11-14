import './globals.css';
import NewsletterForm from '../components/NewsletterForm';
import SearchBox from '../components/SearchBox';
import CartBadge from '../components/CartBadge';
import { STORE, waLink } from '../lib/store';
import { warnOnce } from '../lib/storeCheck';

// Server-rendered on every request, so this is the closest thing the storefront has to a
// boot hook: warn once if a production deploy still carries placeholder contact details.
warnOnce(process.env);

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  icons: { icon: '/favicon.svg' },
  title: {
    default: `${STORE.name}, Machinery, Tools & Handcrafted Furniture`,
    template: '%s'
  },
  description: 'Buy power tools, motors, agriculture equipment, cleaning machines and handcrafted teak furniture online in India. GST invoice, EMI, UPI & bulk quotes.'
};

const SHOP_LINKS = [
  ['Power Tools', '/category/power-tools'],
  ['Motors', '/category/motors'],
  ['Agriculture', '/category/agriculture'],
  ['Pumps', '/category/pumps'],
  ['Welding', '/category/welding'],
  ['Cleaning', '/category/cleaning'],
  ['Furniture', '/category/furniture'],
];

export default function RootLayout({ children }) {
  const storeName = STORE.name;
  return (
    <html lang="en">
      <body>
        {/* Keyboard users shouldn't have to tab through the whole header on every page. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-5 focus:py-2.5 focus:text-xs focus:font-bold focus:uppercase focus:tracking-[0.14em] focus:text-paper"
        >
          Skip to main content
        </a>

        <div className="bg-ink text-paper/75">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] lg:px-10">
            <span className="hidden sm:block">Pune, India · Workshop & store</span>
            <span className="truncate text-paper"><span className="sm:hidden">Free delivery over ₹4,999 · GST invoice</span><span className="hidden sm:inline">Complimentary delivery over ₹4,999 · GST invoice on every order</span></span>
            <a href={waLink('Hi, I would like some help choosing the right product.')} target="_blank" rel="noreferrer" className="hidden shrink-0 text-paper transition hover:text-copper md:block">
              Talk to a human →
            </a>
          </div>
        </div>

        <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1440px] items-center gap-5 px-5 py-4 lg:px-10">
            <a href="/" className="flex shrink-0 items-center gap-3" aria-label={`${storeName} home`}>
              <span className="grid h-10 w-10 place-items-center rounded-full border border-copper/40 font-display text-xl text-copper">E</span>
              <span className="font-display text-[26px] leading-none tracking-[-0.035em]">{storeName}</span>
              <span className="ml-1 hidden h-4 w-px bg-line xl:block" />
              <span className="hidden text-[9px] font-bold uppercase leading-tight tracking-[0.16em] text-muted xl:block">Tools · Teak<br />Pune</span>
            </a>

            <form action="/category/all" method="get" className="hidden flex-1 justify-center md:flex">
              <div className="w-full max-w-[440px]"><SearchBox /></div>
            </form>

            <nav aria-label="Account and cart" className="ml-auto flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.13em]">
              <a href="/track-order" className="hidden text-muted transition hover:text-copper lg:inline-block">Track</a>
              <a href="/account" className="hidden text-muted transition hover:text-copper sm:inline-block">Account</a>
              <a href="/wishlist" className="hidden text-muted transition hover:text-copper xl:inline-block">Wishlist</a>
              <a href="/compare" className="hidden text-muted transition hover:text-copper xl:inline-block">Compare</a>
              <a href="/bulk-quote" className="hidden rounded-full border border-ink/20 px-4 py-2.5 text-ink transition hover:border-copper hover:text-copper lg:inline-block">Bulk quote</a>
              <CartBadge />
            </nav>
          </div>

          <div className="border-t border-line/70 px-5 pb-3 md:hidden">
            <form action="/category/all" method="get" className="flex pt-3">
              <SearchBox compact />
            </form>
            <div className="mt-3 flex gap-4 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
              <a href="/wishlist" className="hover:text-copper">Wishlist</a>
              <a href="/compare" className="hover:text-copper">Compare</a>
              <a href="/account" className="hover:text-copper">Account</a>
              <a href="/my-orders" className="hover:text-copper">My Orders</a>
            </div>
          </div>
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 border-t border-line/70 px-5 lg:px-10">
            <nav aria-label="Shop categories" className="flex gap-6 overflow-x-auto whitespace-nowrap py-2.5 text-[10px] font-bold uppercase tracking-[0.13em] text-muted lg:gap-8">
              {SHOP_LINKS.map(([label, href]) => (
                <a key={href} href={href} className="transition hover:text-copper">{label}</a>
              ))}
              <a href="/category/all" className="transition hover:text-copper">All</a>
            </nav>
            <div className="hidden shrink-0 items-center gap-6 text-[10px] font-bold uppercase tracking-[0.13em] md:flex">
              <a href="/deals" className="text-copper">Deals</a>
              <a href="/brands" className="text-muted transition hover:text-copper">Brands</a>
            </div>
          </div>


        </header>

        <main id="main-content" tabIndex={-1} className="min-h-[70vh]">{children}</main>

        <footer className="mt-24 bg-ink text-paper/65">
          <div className="mx-auto max-w-[1440px] px-6 py-16 lg:px-10 lg:py-20">
            <div className="grid gap-12 lg:grid-cols-[1.4fr_.8fr_.8fr_1.1fr]">
              <div>
                <a href="/" className="font-display text-4xl tracking-[-0.035em] text-paper">{storeName}</a>
                <p className="mt-5 max-w-xs text-sm leading-relaxed text-paper/60">
                  Machinery, tools and handcrafted furniture, chosen by people who use them,
                  finished by people who care.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {['GST invoice', 'Razorpay', 'UPI', 'EMI', 'COD'].map((t) => (
                    <span key={t} className="rounded-full border border-paper/15 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-paper/70">{t}</span>
                  ))}
                </div>
                <p className="mt-8 font-display text-lg italic text-paper/80">“Buy it once. Keep it for years.”</p>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-paper/40">- The {storeName} workshop</p>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-copper">Shop</div>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {SHOP_LINKS.map(([label, href]) => (
                    <li key={href}><a className="transition hover:text-paper" href={href}>{label}</a></li>
                  ))}
                  <li><a className="transition hover:text-paper" href="/brands">All brands</a></li>
                  <li><a className="font-semibold text-copper transition hover:text-paper" href="/deals">Deals of the day</a></li>
                </ul>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-copper">Company</div>
                <ul className="mt-4 space-y-2.5 text-sm">
                  <li><a className="transition hover:text-paper" href="/about-us">About us</a></li>
                  <li><a className="transition hover:text-paper" href="/contact-us">Contact</a></li>
                  <li><a className="transition hover:text-paper" href="/faq">FAQ</a></li>
                  <li><a className="transition hover:text-paper" href="/bulk-orders">Bulk orders</a></li>
                  <li><a className="transition hover:text-paper" href="/track-order">Track order</a></li>
                  <li><a className="transition hover:text-paper" href="/my-orders">My orders</a></li>
                  <li><a className="transition hover:text-paper" href="/account">My account</a></li>
                </ul>
                <div className="mt-8 text-[10px] font-bold uppercase tracking-[0.18em] text-copper">Policies</div>
                <ul className="mt-4 space-y-2.5 text-sm">
                  <li><a className="transition hover:text-paper" href="/shipping-policy">Shipping</a></li>
                  <li><a className="transition hover:text-paper" href="/returns-policy">Returns & refunds</a></li>
                  <li><a className="transition hover:text-paper" href="/cancellation-policy">Cancellation</a></li>
                  <li><a className="transition hover:text-paper" href="/warranty-policy">Warranty</a></li>
                  <li><a className="transition hover:text-paper" href="/privacy-policy">Privacy</a></li>
                  <li><a className="transition hover:text-paper" href="/terms-conditions">Terms</a></li>
                </ul>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-copper">Talk to us</div>
                <p className="mt-4 font-display text-2xl text-paper">A person answers.</p>
                <p className="mt-2 text-sm leading-relaxed text-paper/60">
                  Monday–Saturday, 9am–7pm IST.<br />Before you buy, after it arrives, same number.
                </p>
                <a href={waLink('Hi, I have a question about a product.')} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full bg-copper px-5 py-3 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-paper hover:text-ink">
                  WhatsApp the team →
                </a>
                <p className="mt-5 text-sm text-paper/70"><a className="text-paper hover:text-copper" href={`tel:+${STORE.phoneDigits}`}>{STORE.phoneDisplay}</a></p>
                <p className="text-sm text-paper/70"><a className="hover:text-copper" href={`mailto:${STORE.email}`}>{STORE.email}</a></p>
                <div className="mt-8 border-t border-paper/10 pt-6">
                  <div className="text-xs font-bold text-paper">Notes from the workshop</div>
                  <p className="mt-1 text-xs text-paper/50">New pieces, care guides and quiet offers. No noise.</p>
                  <NewsletterForm />
                </div>
              </div>
            </div>

            <div className="mt-14 flex flex-col gap-3 border-t border-paper/10 pt-6 text-[10px] uppercase tracking-[0.14em] text-paper/35 sm:flex-row sm:items-center sm:justify-between">
              <span>© {new Date().getFullYear()} {storeName}. Prices include GST where noted.</span>
              <div className="flex gap-5 text-paper/45">
                <a href="/bulk-quote" className="hover:text-paper">Bulk quote</a>
                <a href="/emi-options" className="hover:text-paper">EMI</a>
                <a href="/admin" className="hover:text-paper">Admin</a>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
