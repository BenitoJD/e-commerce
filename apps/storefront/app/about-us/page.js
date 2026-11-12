import { STORE } from '../../lib/store';

export default function AboutUs() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-extrabold">About Us</h1>
      <div className="card p-6 mt-5 space-y-3 text-sm text-gray-700">
        <p>{STORE.name} is India&apos;s machinery &amp; power-tools store — drills, motors, agri equipment, welders and cleaning machines at wholesale-friendly prices.</p>
        <p><b>Why buy from us:</b> 100% genuine brands, GST invoice on every order, EMI/UPI/COD, pan-India delivery and real phone support (Mon–Sat, 9am–7pm IST).</p>
        <p><b>For business:</b> Sites, farms and factories buy in bulk with <a href="/bulk-quote" className="text-[#F97316] font-bold underline">bulk quotes</a>, GST input credit and freight support.</p>
        <p>Questions? <a href="/contact-us" className="text-[#F97316] font-bold underline">Contact us</a> — we reply within one working day.</p>
      </div>
    </div>
  );
}
