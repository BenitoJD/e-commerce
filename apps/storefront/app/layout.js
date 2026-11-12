import './globals.css';
import NewsletterForm from '../components/NewsletterForm';

export const metadata = {
  title: 'ToolsKart — India\'s Machinery & Power Tools Store',
  description: 'Buy power tools, motors, agriculture equipment, welding machines & cleaning equipment online in India. GST invoice, EMI, UPI & bulk quotes.'
};

export default function RootLayout({ children }) {
  const storeName = process.env.NEXT_PUBLIC_STORE_NAME || 'ToolsKart';
  return (
    <html lang="en">
      <body>
        <header className="bg-white border-b sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
            <a href="/" className="flex items-center gap-2 shrink-0">
              <span className="w-9 h-9 rounded-lg bg-[#F97316] text-white font-black text-xl grid place-items-center">T</span>
              <span className="font-extrabold text-xl tracking-tight">{storeName}</span>
            </a>
            <form action="/category/all" method="get" className="hidden md:flex flex-1 max-w-xl">
              <input name="q" placeholder="Search drills, motors, pumps, welders..." className="input rounded-r-none" />
              <button type="submit" className="bg-[#F97316] text-white px-4 rounded-r-lg font-semibold">Search</button>
            </form>
            <nav className="ml-auto flex items-center gap-3 text-sm font-semibold">
              <a href="/track-order" className="hidden sm:inline-block text-gray-600 hover:text-[#F97316]">Track Order</a>
              <a href="/wishlist" className="hidden sm:inline-block text-gray-600 hover:text-[#F97316]">❤ Wishlist</a>
              <a href="/bulk-quote" className="hidden sm:inline-block btn-outline !py-2">Bulk Quote</a>
              <a href="/cart" className="btn-primary !py-2">Cart</a>
            </nav>
          </div>
          <div className="md:hidden px-4 pb-3">
            <form action="/category/all" method="get" className="flex">
              <input name="q" placeholder="Search tools..." className="input rounded-r-none" />
              <button type="submit" className="bg-[#F97316] text-white px-4 rounded-r-lg font-semibold">Go</button>
            </form>
          </div>
          <div className="bg-gray-900 text-white text-xs">
            <div className="max-w-7xl mx-auto px-4 py-1.5 flex gap-4 overflow-x-auto whitespace-nowrap">
              <a href="/category/power-tools" className="hover:text-orange-400">Power Tools</a>
              <a href="/category/motors" className="hover:text-orange-400">Motors</a>
              <a href="/category/agriculture" className="hover:text-orange-400">Agriculture</a>
              <a href="/category/welding" className="hover:text-orange-400">Welding</a>
              <a href="/category/cleaning" className="hover:text-orange-400">Cleaning</a>
              <a href="/category/all" className="hover:text-orange-400">All Products</a>
              <a href="/deals" className="text-amber-400 font-bold hover:text-amber-300">🔥 Deals</a>
              <a href="/brands" className="hover:text-orange-400">Brands</a>
            </div>
          </div>
        </header>

        <main className="min-h-[70vh]">{children}</main>

        <footer className="bg-gray-900 text-gray-300 mt-12">
          <div className="max-w-7xl mx-auto px-4 py-10 grid sm:grid-cols-2 md:grid-cols-4 gap-8 text-sm">
            <div>
              <div className="text-white font-extrabold text-lg mb-2">{storeName}</div>
              <p>India&apos;s machinery store. Genuine brands, GST invoice on every order, pan-India delivery.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="badge bg-white/10 text-white">GST Invoice</span>
                <span className="badge bg-white/10 text-white">Razorpay</span>
                <span className="badge bg-white/10 text-white">UPI</span>
                <span className="badge bg-white/10 text-white">EMI</span>
                <span className="badge bg-white/10 text-white">COD</span>
              </div>
            </div>
            <div>
              <div className="text-white font-bold mb-2">Shop</div>
              <ul className="space-y-1.5">
                <li><a className="hover:text-white" href="/category/power-tools">Power Tools</a></li>
                <li><a className="hover:text-white" href="/category/motors">Motors</a></li>
                <li><a className="hover:text-white" href="/category/agriculture">Agriculture</a></li>
                <li><a className="hover:text-white" href="/category/welding">Welding</a></li>
                <li><a className="hover:text-white" href="/category/cleaning">Cleaning</a></li>
                <li><a className="hover:text-white font-bold text-amber-400" href="/deals">🔥 Deals of the Day</a></li>
                <li><a className="hover:text-white" href="/brands">All Brands</a></li>
                <li><a className="hover:text-white" href="/track-order">Track Order</a></li>
                <li><a className="hover:text-white" href="/bulk-orders">Bulk Orders (B2B)</a></li>
                <li><a className="hover:text-white" href="/emi-options">EMI Options</a></li>
              </ul>
            </div>
            <div>
              <div className="text-white font-bold mb-2">Policies & Company</div>
              <ul className="space-y-1.5">
                <li><a className="hover:text-white" href="/shipping-policy">Shipping Policy</a></li>
                <li><a className="hover:text-white" href="/returns-policy">Returns & Refunds</a></li>
                <li><a className="hover:text-white" href="/warranty-policy">Warranty Policy</a></li>
                <li><a className="hover:text-white" href="/privacy-policy">Privacy Policy</a></li>
                <li><a className="hover:text-white" href="/terms-conditions">Terms & Conditions</a></li>
                <li><a className="hover:text-white" href="/about-us">About Us</a></li>
                <li><a className="hover:text-white" href="/contact-us">Contact Us</a></li>
              </ul>
            </div>
            <div>
              <div className="text-white font-bold mb-2">Contact</div>
              <p>Phone / WhatsApp: <a className="text-white" href="https://wa.me/919999999999">+91 99999 99999</a></p>
              <p className="mt-1">Email: care@toolskart.in</p>
              <p className="mt-1">Mon–Sat, 9am–7pm IST</p>
              <a href="/bulk-quote" className="inline-block mt-3 btn-primary !py-2 text-sm">Request Bulk Quote</a>
              <div className="mt-4">
                <div className="text-white font-bold text-sm">Get deals in your inbox</div>
                <NewsletterForm />
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 text-center text-xs py-4">© {new Date().getFullYear()} {storeName}. All rights reserved. Prices incl. GST where noted. <a href="/admin" className="text-gray-500 hover:text-gray-300 ml-2">Admin</a></div>
        </footer>
      </body>
    </html>
  );
}
