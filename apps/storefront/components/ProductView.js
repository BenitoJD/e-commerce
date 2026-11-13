'use client';

import { useEffect, useState } from 'react';
import { fetchProduct, searchProducts, asList, getReviews, addReview, getQuestions, addQuestion, checkPincode, safeVideoUrls, stockAlert } from '../lib/api';
import { addToCart } from '../lib/cart';
import { addToWishlist, removeFromWishlist, isWishlisted } from '../lib/wishlist';
import { waShareLink } from '../lib/store';
import { pushRecent, parseRecent } from '../lib/recent';
import { toggleCompare, parseCompare, COMPARE_KEY } from '../lib/compare';
import { fitClass, isProductShot } from '../lib/image';
import ProductCard from './ProductCard';

const FALLBACK = {
  slug: 'bosch-gws-600-grinder',
  name: 'Bosch GWS 600 670W 100mm Angle Grinder',
  price: 3499,
  mrp: 4295,
  brand: 'Bosch',
  category: 'power-tools',
  image: '/images/products/bosch-gws-600-grinder.jpg',
  images: ['/images/products/bosch-gws-600-grinder.jpg'],
  specs: { Power: '670W', Voltage: '230V', Warranty: '6 months' },
  description: 'Genuine Bosch angle grinder for masonry, metal and workshop use. GST invoice included.'
};

function Stars({ value = 0, size = 'text-base' }) {
  return (
    <span className={`text-amber-500 ${size}`} aria-label={`${value} stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i}>{i <= Math.round(value) ? '★' : '☆'}</span>
      ))}
    </span>
  );
}

export default function ProductView({ slug: slugProp, initialProduct = null }) {
  const slug = slugProp;
  const [p, setP] = useState(initialProduct || null);
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [added, setAdded] = useState(false);
  const [wished, setWished] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareMsg, setCompareMsg] = useState('');
  const [alertEmail, setAlertEmail] = useState('');
  const [alertBusy, setAlertBusy] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');

  // pincode
  const [pin, setPin] = useState('');
  const [pinState, setPinState] = useState({ loading: false, msg: '', ok: false });

  // reviews
  const [reviews, setReviews] = useState([]);
  const [avg, setAvg] = useState(0);
  const [count, setCount] = useState(0);
  const [rForm, setRForm] = useState({ name: '', rating: 5, title: '', body: '' });
  const [rMsg, setRMsg] = useState('');
  const [rBusy, setRBusy] = useState(false);

  // q&a
  const [qa, setQa] = useState([]);
  const [qForm, setQForm] = useState({ name: '', question: '' });
  const [qMsg, setQMsg] = useState('');
  const [qBusy, setQBusy] = useState(false);

  // related
  const [related, setRelated] = useState([]);

  useEffect(() => { setActiveImage(0); }, [slug]);

  useEffect(() => {
    let alive = true;
    async function load() {
      // Server already provided the product; only refetch when it was not supplied
      // (e.g. direct client navigation) so the SSR content is never replaced by a flash.
      if (initialProduct && initialProduct.name) return;
      try {
        const data = await fetchProduct(slug);
        const prod = data.product || data;
        if (alive) setP(prod && prod.name ? prod : { ...FALLBACK, slug });
      } catch {
        if (alive) setP({ ...FALLBACK, slug });
      }
    }
    load();
    if (typeof window !== 'undefined') {
      setWished(isWishlisted(slug));
      setComparing(parseCompare(localStorage.getItem(COMPARE_KEY)).some((x) => String(x.slug) === String(slug)));
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // record recently viewed + load related once product known
  useEffect(() => {
    if (!p || typeof window === 'undefined') return;
    try {
      const key = 'tw_recent';
      const list = parseRecent(localStorage.getItem(key));
      const entry = {
        slug: p.slug || slug,
        name: p.name,
        price: p.price,
        brand: p.brand || '',
        image: p.image || (p.images && p.images[0]) || '',
      };
      localStorage.setItem(key, JSON.stringify(pushRecent(list, entry)));
    } catch { /* ignore */ }
    let alive = true;
    async function loadRelated() {
      try {
        const data = await searchProducts({ category: p.category || '', limit: 8 });
        const list = asList(data).filter((i) => (i.slug || i.id) !== (p.slug || slug)).slice(0, 4);
        if (alive) setRelated(list);
      } catch { /* ignore */ }
    }
    if (p.category) loadRelated();
    return () => { alive = false; };
  }, [p, slug]);

  // reviews + q&a
  useEffect(() => {
    let alive = true;
    async function loadEngage() {
      try {
        const r = await getReviews(slug);
        if (alive && r) {
          applyReviews(r.reviews || asList(r) || []);
        }
      } catch { /* no reviews yet */ }
      try {
        const qd = await getQuestions(slug);
        if (alive && qd) {
          const list = qd.questions || qd.items || asList(qd) || [];
          setQa(Array.isArray(list) ? list : []);
        }
      } catch { /* no questions yet */ }
    }
    loadEngage();
    return () => { alive = false; };
  }, [slug]);

  if (!p) return <div className="max-w-7xl mx-auto px-4 py-10 text-gray-500">Loading product...</div>;

  const images = p.images && p.images.length ? p.images : [p.image || FALLBACK.image];
  const mainImage = images[Math.min(activeImage, images.length - 1)] || FALLBACK.image;
  const videos = safeVideoUrls(p.videos);
  const off = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const emi = (m) => Math.round(Number(p.price) / m);
  const stockNum = p.stock == null ? null : Math.max(0, Number(p.stock) || 0);
  const outOfStock = stockNum !== null && stockNum <= 0;
  const lowStock = stockNum !== null && stockNum > 0 && stockNum <= 5;

  const doStockAlert = async () => {
    setAlertMsg('');
    const email = alertEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAlertMsg('Enter a valid email address.');
      return;
    }
    setAlertBusy(true);
    try {
      await stockAlert(p.slug || slug, email);
      setAlertMsg(`Saved — our team will contact ${email} as soon as it's back in stock.`);
      setAlertEmail('');
    } catch (err) {
      setAlertMsg(err.message || 'Could not save. Try again.');
    } finally {
      setAlertBusy(false);
    }
  };

  const doAdd = () => {
    if (outOfStock) return;
    addToCart(p, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };
  const buyNow = () => {
    if (outOfStock) return;
    addToCart(p, qty);
    window.location.href = '/checkout';
  };
  const toggleWish = () => {
    if (wished) {
      removeFromWishlist(p.slug || slug);
      setWished(false);
    } else {
      addToWishlist({ slug: p.slug || slug, name: p.name, price: p.price, brand: p.brand, image: images[0], stock: p.stock });
      setWished(true);
    }
  };

  // Ratings aggregate counts verified reviews only; pending ones show with a tag.
  const applyReviews = (list) => {
    const arr = Array.isArray(list) ? list : [];
    setReviews(arr);
    const vis = arr.filter((r) => r.verified);
    setCount(vis.length);
    setAvg(vis.length ? Math.round((vis.reduce((s, r) => s + (Number(r.rating) || 0), 0) / vis.length) * 10) / 10 : 0);
  };

  const checkPin = async () => {
    if (!/^\d{6}$/.test(pin)) {
      setPinState({ loading: false, msg: 'Enter a valid 6-digit pincode.', ok: false });
      return;
    }
    setPinState({ loading: true, msg: 'Checking...', ok: false });
    try {
      // Pass the basket amount so COD availability reflects the real cap, not a guess.
      const basketPaise = Math.round(Number(p.price || 0) * 100) * Math.max(1, Number(qty) || 1);
      const r = await checkPincode(pin, basketPaise);
      if (r && r.serviceable === false) {
        setPinState({ loading: false, msg: `Sorry, ${pin} is not serviceable yet. Try a nearby pincode.`, ok: false });
      } else {
        const eta = r.etaDays ? `${r.etaDays}-day delivery` : '3–7 day delivery';
        const cod = r.codAvailable === false ? 'Prepaid only' : 'COD available';
        const zone = r.zone ? ` • Zone ${r.zone}` : '';
        setPinState({ loading: false, msg: `Delivering to ${pin}: ${eta}, ${cod}${zone}.`, ok: true });
      }
    } catch {
      setPinState({ loading: false, msg: `Delivery to ${pin} in 3–7 days. COD available on most orders.`, ok: true });
    }
  };

  const submitReview = async (e) => {
    e.preventDefault();
    setRMsg('');
    if (!rForm.name.trim() || !rForm.body.trim()) { setRMsg('Please add your name and review.'); return; }
    setRBusy(true);
    try {
      await addReview(slug, rForm);
      setRMsg('Thanks! Your review will appear after approval.');
      setRForm({ name: '', rating: 5, title: '', body: '' });
      const r = await getReviews(slug).catch(() => null);
      if (r) {
        applyReviews(r.reviews || []);
      }
    } catch (err) {
      setRMsg(err.message || 'Could not submit review.');
    } finally {
      setRBusy(false);
    }
  };

  const submitQuestion = async (e) => {
    e.preventDefault();
    setQMsg('');
    if (!qForm.question.trim()) { setQMsg('Please type your question.'); return; }
    setQBusy(true);
    try {
      await addQuestion(slug, { name: qForm.name.trim() || 'Guest', question: qForm.question.trim() });
      setQMsg('Question submitted! The seller usually answers within 24–48 hrs.');
      setQForm({ name: '', question: '' });
      const qd = await getQuestions(slug).catch(() => null);
      if (qd) setQa(qd.questions || qd.items || []);
    } catch (err) {
      setQMsg(err.message || 'Could not submit question.');
    } finally {
      setQBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-8 lg:px-10 lg:py-10">
      <nav aria-label="Breadcrumb" className="mb-5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
        <a href="/" className="transition hover:text-copper">Home</a>
        <span className="mx-1.5">/</span>
        <a href={`/category/${encodeURIComponent(p.category || 'all')}`} className="capitalize transition hover:text-copper">
          {String(p.category || 'All products').replace(/-/g, ' ')}
        </a>
        {p.brand ? (
          <>
            <span className="mx-1">/</span>
            <a href={`/brand/${encodeURIComponent(p.brand)}`} className="transition hover:text-copper">{p.brand}</a>
          </>
        ) : null}
        <span className="mx-1.5">/</span>
        <span className="text-ink/70">{p.name}</span>
      </nav>
      <div className="grid gap-10 md:grid-cols-2 lg:gap-16">
        <div>
          <div className="overflow-hidden rounded-[2rem] border border-line bg-[#EFE5D7]">
            <img src={mainImage} alt={p.name} className={`aspect-square w-full ${isProductShot(mainImage) ? 'object-contain p-8 mix-blend-multiply' : 'object-cover'}`} />
          </div>
          {images.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Product images">
              {images.slice(0, 4).map((src, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  aria-label={`View image ${i + 1} of ${Math.min(images.length, 4)}`}
                  aria-pressed={i === activeImage}
                  className={`overflow-hidden rounded-xl border bg-surface ${i === activeImage ? 'border-copper ring-1 ring-copper' : 'border-line hover:border-copper'}`}
                >
                  <img src={src} alt="" className={`${fitClass(src, 'h-20 w-full object-cover')} ${isProductShot(src) ? 'mix-blend-multiply' : ''}`} loading="lazy" />
                </button>
              ))}
            </div>
          )}
          {videos.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-bold mb-2">Product video</div>
              <div className="aspect-video w-full rounded-xl overflow-hidden border bg-black">
                <iframe
                  src={videos[0]}
                  title={`${p.name} video`}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Demo/usage video. Actual unit may vary.</p>
            </div>
          )}
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-copper">{p.brand || 'E-Commerce'}</div>
          <h1 className="mt-2 font-display text-3xl leading-[1.08] tracking-[-0.025em] text-ink lg:text-[2.7rem]">{p.name}</h1>
          {/* Rating summary next to the title: shoppers decide here, not 400px lower. */}
          {count > 0 ? (
            <a href="#reviews" className="mt-2 inline-flex items-center gap-2 text-sm">
              <Stars value={avg} size="text-base" />
              <span className="font-bold">{Number(avg).toFixed(1)}</span>
              <span className="text-gray-500">({count} review{Number(count) === 1 ? '' : 's'})</span>
            </a>
          ) : (
            <a href="#reviews" className="mt-2 inline-block text-sm text-gray-500 underline">Be the first to review</a>
          )}
          <div className="mt-5 flex items-baseline gap-3">
            <span className="font-display text-4xl text-ink">₹{Number(p.price).toLocaleString('en-IN')}</span>
            {p.mrp && <span className="text-gray-400 line-through">₹{Number(p.mrp).toLocaleString('en-IN')}</span>}
            {off > 0 && <span className="badge border border-copper/30 bg-copper-light text-copper">{off}% off</span>}
          </div>
          {off > 0 ? (
            <p className="mt-1 text-sm font-semibold text-copper">
              You save ₹{(Number(p.mrp) - Number(p.price)).toLocaleString('en-IN')} ({off}% off MRP)
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted">Inclusive of all taxes · GST invoice available for input credit</p>
          <p className={`text-sm font-bold mt-2 ${outOfStock ? 'text-red-600' : lowStock ? 'text-amber-600' : 'text-green-700'}`}>
            {outOfStock ? 'Out of stock' : lowStock ? `Only ${stockNum} left — order soon` : stockNum !== null ? 'In stock' : 'In stock'}
          </p>

          {outOfStock && (
            <div className="mt-3 card p-4">
              <b className="text-sm">Notify me when back in stock</b>
              <p className="text-xs text-gray-500 mt-1">
                Leave your email and our team will contact you when this is available again.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  value={alertEmail}
                  onChange={(e) => setAlertEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input"
                  inputMode="email"
                  type="email" aria-label="Email address" autoComplete="email" />
                <button onClick={doStockAlert} disabled={alertBusy} className="btn-primary whitespace-nowrap disabled:opacity-60">
                  {alertBusy ? 'Saving...' : 'Notify me'}
                </button>
              </div>
              {alertMsg && <p role="status" className="text-xs font-semibold mt-2 text-green-700">{alertMsg}</p>}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <span className="label !mb-0">Qty</span>
            <div className="flex items-center border rounded-lg">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-3 py-2 font-bold">−</button>
              <span className="px-4 font-bold">{qty}</span>
              <button onClick={() => setQty(Math.min(stockNum !== null ? Math.max(stockNum, 1) : 99, qty + 1))} className="px-3 py-2 font-bold">+</button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <button onClick={doAdd} disabled={outOfStock} className="btn-outline disabled:opacity-50">{added ? 'Added ✓' : outOfStock ? 'Out of Stock' : 'Add to Cart'}</button>
            <button onClick={buyNow} disabled={outOfStock} className="btn-primary disabled:opacity-50">Buy Now</button>
            <button onClick={toggleWish} aria-label="Toggle wishlist" className={`inline-flex items-center gap-2 rounded-full border px-4 py-3 text-xs font-bold transition ${wished ? 'border-copper bg-copper-light text-copper' : 'border-line text-muted hover:border-copper hover:text-copper'}`}>
              {wished ? '❤ Wishlisted' : '♡ Wishlist'}
            </button>
            <button
              onClick={() => {
                setCompareMsg('');
                const current = parseCompare(localStorage.getItem(COMPARE_KEY));
                const next = toggleCompare(current, {
                  slug: p.slug || slug,
                  name: p.name,
                  price: p.price,
                  image: p.image || (p.images && p.images[0]) || '',
                  brand: p.brand || '',
                });
                const alreadyIn = current.some((x) => String(x.slug) === String(p.slug || slug));
                if (!alreadyIn && next.length === current.length && current.length >= 4) {
                  setCompareMsg('You can compare up to 4 products — remove one to add another.');
                }
                try { localStorage.setItem(COMPARE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
                window.dispatchEvent(new Event('compare-updated'));
                setComparing(next.some((x) => String(x.slug) === String(p.slug || slug)));
              }}
              className={`btn-outline !px-4 !py-3 text-xs ${comparing ? '!bg-copper-light !text-copper' : ''}`}
              aria-pressed={comparing}
            >
              {comparing ? '✓ Comparing' : '⇄ Compare'}
            </button>
            {comparing ? (
              <a href="/compare" className="text-xs font-bold text-[#A95F32] underline self-center">See comparison</a>
            ) : null}
            {compareMsg ? <p role="status" className="text-xs font-semibold text-amber-700 w-full">{compareMsg}</p> : null}
            <a
              href={waShareLink(
                `${p.name} — ₹${Number(p.price || 0).toLocaleString('en-IN')}`,
                `${process.env.NEXT_PUBLIC_SITE_URL || ''}/product/${encodeURIComponent(p.slug || slug)}`
              )}
              target="_blank"
              rel="noreferrer"
              aria-label="Share on WhatsApp"
              className="inline-flex items-center rounded-full border border-line px-4 py-3 text-xs font-bold text-muted transition hover:border-copper hover:text-copper"
            >
              Share
            </a>
          </div>

          <div className="mt-6 rounded-2xl border border-line bg-surface p-5 text-sm">
            <b className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Delivery check</b>
            <div className="mt-2 flex gap-2">
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Pincode e.g. 110001" className="input" inputMode="numeric" aria-label="Pincode for delivery check" />
              <button onClick={checkPin} disabled={pinState.loading} className="btn-primary whitespace-nowrap disabled:opacity-60">Check</button>
            </div>
            {pinState.msg && <p role="status" className={`text-xs font-semibold mt-2 ${pinState.ok ? 'text-green-700' : 'text-gray-600'}`}>{pinState.msg}</p>}
          </div>

          <div className="mt-3 rounded-2xl border border-line bg-surface p-5 text-sm">
            <b className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">EMI options</b>
            <ul className="mt-3 space-y-1.5 text-ink/80">
              <li>3 mo × ₹{emi(3).toLocaleString('en-IN')}</li>
              <li>6 mo × ₹{emi(6).toLocaleString('en-IN')}</li>
              <li>9 mo × ₹{emi(9).toLocaleString('en-IN')}</li>
              <li>12 mo × ₹{emi(12).toLocaleString('en-IN')} (no-cost on eligible cards)</li>
            </ul>
            <p className="text-xs text-gray-500 mt-2">EMI via Razorpay on credit / debit cards. UPI & COD also accepted at checkout. <a href="/emi-options" className="text-[#A95F32] font-bold underline">EMI details</a></p>
          </div>

          {p.specs && (
            <div className="mt-5">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Specifications</h2>
              <table className="mt-3 w-full overflow-hidden rounded-xl border border-line text-sm">
                <tbody>
                  {Object.entries(p.specs).map(([k, v]) => (
                    <tr key={k} className="border-t border-line first:border-0">
                      <td className="w-1/3 bg-[#F2E9DC] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{k}</td>
                      <td className="px-4 py-3 text-ink/80">{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {p.description && <p className="mt-5 text-sm leading-[1.85] text-muted">{p.description}</p>}

          <div className="mt-6 grid grid-cols-3 gap-3 border-y border-line py-4 text-center">
            {[['Genuine', 'brand & warranty'], ['GST', 'invoice included'], ['Pan-India', 'delivery']].map(([a, b]) => (
              <div key={a}>
                <div className="font-display text-lg text-ink">{a}</div>
                <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-muted">{b}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <a href={`/bulk-quote?product=${encodeURIComponent(p.slug || slug)}&pname=${encodeURIComponent(p.name || '')}`} className="text-[#A95F32] font-bold underline">Request Bulk Quote (5+ units)</a>
          </div>
          <p className="mt-2 text-xs text-gray-500">GST invoice note: business buyers receive a GST invoice by email for input tax credit.</p>
        </div>
      </div>

      {/* Reviews */}
      <div className="mt-12 grid md:grid-cols-3 gap-6">
        <div id="reviews" className="h-fit scroll-mt-28 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl text-ink">Ratings & Reviews</h2>
          <div className="mt-2 flex items-center gap-2">
            <Stars value={avg} size="text-xl" />
            <span className="font-extrabold">{avg ? Number(avg).toFixed(1) : 'New'}</span>
            <span className="text-sm text-gray-500">({count} reviews)</span>
          </div>
          <form onSubmit={submitReview} className="mt-4 space-y-3">
            <div><label className="label">Your name</label><input className="input" value={rForm.name} onChange={(e) => setRForm({ ...rForm, name: e.target.value })} placeholder="Ravi Kumar" aria-label="Full name" /></div>
            <div>
              <label className="label">Rating</label>
              <select className="input" value={rForm.rating} onChange={(e) => setRForm({ ...rForm, rating: Number(e.target.value) })}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>
            <div><label className="label">Title</label><input className="input" value={rForm.title} onChange={(e) => setRForm({ ...rForm, title: e.target.value })} placeholder="Great drill for the price" aria-label="Review title" /></div>
            <div><label className="label">Review</label><textarea className="input" rows={3} value={rForm.body} onChange={(e) => setRForm({ ...rForm, body: e.target.value })} placeholder="Build quality, performance..." aria-label="Review" /></div>
            {rMsg && <p className="text-xs font-semibold text-gray-700">{rMsg}</p>}
            <button disabled={rBusy} className="btn-primary w-full disabled:opacity-60">{rBusy ? 'Submitting...' : 'Submit Review'}</button>
          </form>
        </div>
        <div className="md:col-span-2 space-y-3">
          {reviews.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-6 text-sm text-muted">No reviews yet. Be the first to review this product!</div>
          ) : reviews.map((r, i) => (
            <div key={r.id || r._id || i} className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center gap-2 flex-wrap">
                <Stars value={r.rating} size="text-sm" />
                <b className="text-sm">{r.title || (r.verified ? 'Verified review' : 'Customer review')}</b>
                {r.verified ? (
                  <span className="badge border border-green-200 bg-green-50 text-green-800">Verified purchase</span>
                ) : (
                  <span className="badge border border-amber-200 bg-amber-50 text-amber-800">Pending approval</span>
                )}
              </div>
              <p className="text-sm text-gray-700 mt-1">{r.body || r.text || ''}</p>
              <p className="text-xs text-gray-500 mt-2">— {r.name || r.author || 'Verified buyer'}{r.createdAt ? ` • ${new Date(r.createdAt).toLocaleDateString('en-IN')}` : ''}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Q&A */}
      <div className="mt-10 grid md:grid-cols-3 gap-6">
        <div className="h-fit rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl text-ink">Questions & Answers</h2>
          <p className="text-xs text-gray-500 mt-1">Ask about compatibility, warranty, installation.</p>
          <form onSubmit={submitQuestion} className="mt-3 space-y-3">
            <div><label className="label">Your name</label><input className="input" value={qForm.name} onChange={(e) => setQForm({ ...qForm, name: e.target.value })} placeholder="Your name" aria-label="Your name" /></div>
            <div><label className="label">Question</label><textarea className="input" rows={3} value={qForm.question} onChange={(e) => setQForm({ ...qForm, question: e.target.value })} placeholder="Is this suitable for 8-hour daily workshop use?" aria-label="Your question" /></div>
            {qMsg && <p className="text-xs font-semibold text-gray-700">{qMsg}</p>}
            <button disabled={qBusy} className="btn-outline w-full disabled:opacity-60">{qBusy ? 'Submitting...' : 'Ask Question'}</button>
          </form>
        </div>
        <div className="md:col-span-2 space-y-3">
          {qa.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-6 text-sm text-muted">No questions yet. Ask the first one!</div>
          ) : qa.map((it, i) => (
            <div key={it.id || it._id || i} className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-sm font-bold">Q: {it.question || it.title || it.body}</p>
              <p className="text-xs text-gray-500 mt-1">— {it.name || it.author || 'Customer'}</p>
              {(it.answer || it.reply) && <p className="text-sm text-gray-700 mt-2 bg-green-50 border border-green-100 rounded-lg p-2">A: {it.answer || it.reply}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-xl">Related Products</h2>
            {p.category && <a href={`/category/${p.category}`} className="text-[#A95F32] font-bold text-sm">More in {String(p.category).replace(/-/g, ' ')} →</a>}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 lg:gap-x-6">
            {related.map((r) => <ProductCard key={r.slug || r.id} p={r} />)}
          </div>
        </div>
      )}
    </div>
  );
}
