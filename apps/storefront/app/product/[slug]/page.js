'use client';

import { useEffect, useState } from 'react';
import { fetchProduct } from '../../../lib/api';
import { addToCart } from '../../../lib/cart';

const FALLBACK = {
  slug: 'bosch-gsb-13-re-drill',
  name: 'Bosch GSB 13 RE Impact Drill 600W',
  price: 3499,
  mrp: 4995,
  brand: 'Bosch',
  category: 'power-tools',
  image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800&q=80',
  images: ['https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800&q=80'],
  specs: { Power: '600W', Chuck: '13mm', Speed: '0-2800 RPM', Warranty: '6 months', 'In the box': 'Drill, chuck key, manual' },
  description: 'Genuine Bosch impact drill for masonry, wood & metal. GST invoice included.'
};

export default function ProductPage({ params }) {
  const slug = params.slug;
  const [p, setP] = useState(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await fetchProduct(slug);
        const prod = data.product || data;
        if (alive) setP(prod && prod.name ? prod : { ...FALLBACK, slug });
      } catch {
        if (alive) setP({ ...FALLBACK, slug });
      }
    }
    load();
    return () => { alive = false; };
  }, [slug]);

  if (!p) return <div className="max-w-7xl mx-auto px-4 py-10 text-gray-500">Loading product...</div>;

  const images = p.images && p.images.length ? p.images : [p.image || FALLBACK.image];
  const off = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const emi12 = Math.round(Number(p.price) / 12);
  const emi9 = Math.round(Number(p.price) / 9);
  const emi6 = Math.round(Number(p.price) / 6);

  const doAdd = () => {
    addToCart(p, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };
  const buyNow = () => {
    addToCart(p, qty);
    window.location.href = '/checkout';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 grid md:grid-cols-2 gap-8">
      <div>
        <img src={images[0]} alt={p.name} className="rounded-2xl border w-full h-96 object-cover" />
        {images.length > 1 && (
          <div className="mt-3 grid grid-cols-4 gap-2">
            {images.slice(0, 4).map((src, i) => (
              <img key={i} src={src} alt="" className="h-20 w-full object-cover rounded-lg border" loading="lazy" />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-sm font-bold text-[#F97316]">{p.brand || ''}</div>
        <h1 className="text-2xl md:text-3xl font-extrabold mt-1">{p.name}</h1>
        <div className="mt-3 flex items-baseline gap-3">
          <span className="text-3xl font-black">₹{Number(p.price).toLocaleString('en-IN')}</span>
          {p.mrp && <span className="text-gray-400 line-through">₹{Number(p.mrp).toLocaleString('en-IN')}</span>}
          {off > 0 && <span className="badge bg-green-600 text-white">{off}% OFF</span>}
        </div>
        <p className="text-xs text-gray-500 mt-1">Inclusive of all taxes • GST invoice available for ITC</p>

        <div className="mt-4 flex items-center gap-3">
          <span className="label !mb-0">Qty</span>
          <div className="flex items-center border rounded-lg">
            <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-3 py-2 font-bold">−</button>
            <span className="px-4 font-bold">{qty}</span>
            <button onClick={() => setQty(Math.min(99, qty + 1))} className="px-3 py-2 font-bold">+</button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={doAdd} className="btn-outline">{added ? 'Added ✓' : 'Add to Cart'}</button>
          <button onClick={buyNow} className="btn-primary">Buy Now</button>
        </div>

        <div className="mt-5 card p-4 text-sm">
          <b>EMI options</b>
          <ul className="mt-2 space-y-1 text-gray-700">
            <li>12 mo × ₹{emi12.toLocaleString('en-IN')} (no-cost on eligible cards)</li>
            <li>9 mo × ₹{emi9.toLocaleString('en-IN')}</li>
            <li>6 mo × ₹{emi6.toLocaleString('en-IN')}</li>
          </ul>
          <p className="text-xs text-gray-500 mt-2">EMI via Razorpay on credit / debit cards. UPI & COD also accepted at checkout.</p>
        </div>

        {p.specs && (
          <div className="mt-5">
            <h2 className="font-extrabold">Specifications</h2>
            <table className="mt-2 w-full text-sm border rounded-lg overflow-hidden">
              <tbody>
                {Object.entries(p.specs).map(([k, v]) => (
                  <tr key={k} className="border-t first:border-0">
                    <td className="bg-gray-100 px-3 py-2 font-semibold w-1/3">{k}</td>
                    <td className="px-3 py-2">{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {p.description && <p className="mt-4 text-sm text-gray-700">{p.description}</p>}

        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <a href={`/bulk-quote?product=${encodeURIComponent(p.name)}`} className="text-[#F97316] font-bold underline">Request Bulk Quote (5+ units)</a>
        </div>
        <p className="mt-2 text-xs text-gray-500">GST invoice note: business buyers receive a GST invoice by email for input tax credit.</p>
      </div>
    </div>
  );
}
