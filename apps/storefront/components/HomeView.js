'use client';

import { useEffect, useState } from 'react';
import { fetchProducts, asList } from '../lib/api';
import { parseRecent } from '../lib/recent';
import ProductCard from './ProductCard';
import { waLink } from '../lib/store';

const FALLBACK = [
  { slug: 'bosch-gws-600-grinder', name: 'Bosch GWS 600 670W Angle Grinder', price: 3499, mrp: 4295, brand: 'Bosch', category: 'power-tools', image: '/images/products/bosch-gws-600-grinder.jpg', stock: 10 },
  { slug: 'makita-9553nb-grinder', name: 'Makita 9553NB 100mm Angle Grinder', price: 6899, mrp: 8250, brand: 'Makita', category: 'power-tools', image: '/images/products/makita-9553nb-grinder.jpg', stock: 10 },
  { slug: 'crompton-5hp-motor', name: 'Crompton 5HP 3-Phase Motor', price: 24999, mrp: 28999, brand: 'Crompton', category: 'motors', image: '/images/products/crompton-5hp-motor.jpg', stock: 10 },
  { slug: 'kirloskar-1hp-water-pump', name: 'Kirloskar 1HP Monoblock Pump', price: 9499, mrp: 11299, brand: 'Kirloskar', category: 'pumps', image: '/images/products/kirloskar-1hp-water-pump.jpg', stock: 10 },
  { slug: 'neptune-battery-sprayer', name: 'Neptune 16L Battery Sprayer', price: 3299, mrp: 4200, brand: 'Neptune', category: 'agriculture', image: '/images/products/neptune-battery-sprayer.jpg', stock: 10 },
  { slug: 'ibell-arc-250-welding', name: 'iBELL ARC 250 Inverter Welder', price: 8999, mrp: 12999, brand: 'iBELL', category: 'welding', image: '/images/products/ibell-arc-250-welding.jpg', stock: 10 },
  { slug: 'karcher-hd5-pressure-washer', name: 'Karcher HD 5/11 Pressure Washer', price: 27999, mrp: 32000, brand: 'Karcher', category: 'cleaning', image: '/images/products/karcher-hd5-pressure-washer.jpg', stock: 10 },
  { slug: 'bosch-gsh-11-vc-breaker', name: 'Bosch GSH 11 VC Demolition Hammer', price: 89999, mrp: 98500, brand: 'Bosch', category: 'power-tools', image: '/images/products/bosch-gsh-11-vc-breaker.jpg', stock: 10 }
];

const CATS = [
  { slug: 'power-tools', name: 'Power Tools', img: '/images/products/bosch-gws-600-grinder.jpg', note: 'Drills, grinders, saws' },
  { slug: 'motors', name: 'Motors', img: '/images/products/crompton-5hp-motor.jpg', note: 'Single & three phase' },
  { slug: 'agriculture', name: 'Agriculture', img: '/images/products/neptune-battery-sprayer.jpg', note: 'Sprayers & cutters' },
  { slug: 'welding', name: 'Welding', img: '/images/products/ibell-arc-250-welding.jpg', note: 'ARC, MIG & TIG' },
  { slug: 'cleaning', name: 'Cleaning', img: '/images/products/karcher-hd5-pressure-washer.jpg', note: 'Washers & scrubbers' },
  { slug: 'furniture', name: 'Furniture', img: '/images/gracewood-carved-door.jpg', note: 'Solid teak, hand-finished' },
];

function off(p) {
  if (!p.mrp || p.mrp <= p.price) return null;
  return Math.round(((p.mrp - p.price) / p.mrp) * 100);
}

export default function HomeView({ initialProducts = null }) {
  const seeded = Array.isArray(initialProducts) && initialProducts.length;
  const [products, setProducts] = useState(seeded ? initialProducts : FALLBACK);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (seeded) return;
      try {
        const live = await fetchProducts({ limit: 24 });
        const list = asList(live);
        if (alive && list.length) setProducts(list);
      } catch { /* keep fallback */ }
    }
    load();
    try {
      setRecent(parseRecent(localStorage.getItem('tw_recent')));
    } catch { /* ignore */ }
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deals = [...products]
    .map((p) => ({ p, d: off(p) || 0 }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 4)
    .map((x) => x.p);

  const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))].slice(0, 10);

  return (
    <div>
      {/* Editorial hero: people first, product second, no loud gradients. */}
      <section className="relative overflow-hidden border-b border-line bg-paper">
        <div className="mx-auto grid max-w-[1440px] items-center gap-14 px-5 pb-16 pt-12 lg:grid-cols-[1.02fr_0.98fr] lg:px-10 lg:pb-24 lg:pt-16">
          <div className="animate-rise">
            <div className="flex items-center gap-3">
              <span className="h-px w-10 bg-copper" />
              <span className="eyebrow">Pune, India · Workshop & store</span>
            </div>
            <h1 className="mt-6 font-display text-[clamp(3.2rem,6vw,5.4rem)] leading-[0.92] tracking-[-0.045em] text-ink">
              Made to work.<br /><em className="font-normal not-italic text-copper">Made to stay.</em>
            </h1>
            <p className="mt-7 max-w-xl text-[15px] leading-[1.8] text-muted lg:text-base">
              Machinery, tools and handcrafted teak furniture — chosen by people who use them,
              finished by people who care. Honest advice, GST invoices, delivery across India.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/category/all" className="btn-primary">Explore the collection</a>
              <a href="#people" className="btn-outline">Meet the makers</a>
            </div>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6">
              {[['24', 'trusted brands'], ['36', 'chosen pieces'], ['1:1', 'human support']].map(([n, l]) => (
                <div key={l}>
                  <div className="font-display text-2xl text-ink">{n}</div>
                  <div className="mt-0.5 text-[9px] font-bold uppercase leading-tight tracking-[0.14em] text-muted">{l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative animate-rise-delay">
            <div className="overflow-hidden rounded-[2.5rem] border border-line bg-[#EFE5D7]">
              <img src="/images/workshop-lead.jpg" alt="A craftsman reviewing a hand-drawn sofa design in the workshop" className="aspect-[4/5] w-full object-cover" />
            </div>
            <div className="absolute -bottom-8 -left-5 hidden w-44 overflow-hidden rounded-3xl border-[6px] border-paper bg-white shadow-soft sm:block lg:-left-10">
              <img src="/images/gracewood-teak-sofa.jpg" alt="Handcrafted teak sofa set" className="aspect-square w-full object-cover" />
            </div>
            <div className="absolute right-4 top-4 rounded-full border border-white/40 bg-ink/55 px-3.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur">
              Solid teak · hand-finished
            </div>
            <div className="absolute bottom-6 right-5 hidden rounded-2xl bg-paper/95 px-4 py-3 text-[11px] leading-snug text-ink shadow-soft md:block">
              <span className="font-display text-base">Every order</span><br />
              <span className="text-muted">packed by our team</span>
            </div>
          </div>
        </div>
      </section>

      {/* Category edit */}
      <section className="mx-auto max-w-[1440px] px-5 py-16 lg:px-10 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow">The collection</span>
            <h2 className="mt-2 font-display text-3xl text-ink lg:text-4xl">Shop by Category</h2>
          </div>
          <a href="/category/all" className="text-[10px] font-bold uppercase tracking-[0.16em] text-copper transition hover:text-ink">All products →</a>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
          {CATS.map((c) => (
            <a key={c.slug} href={`/category/${c.slug}`} className="group block">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[#EFE5D7]">
                <img
                  src={c.img}
                  alt={c.name}
                  loading="lazy"
                  className={`h-full w-full transition duration-700 group-hover:scale-[1.04] ${c.slug === 'furniture' ? 'object-cover' : 'object-contain p-5 mix-blend-multiply'}`}
                />
                <span className="absolute left-3 top-3 font-display text-xs text-ink/40">0{CATS.indexOf(c) + 1}</span>
              </div>
              <div className="mt-2.5 flex items-baseline justify-between gap-2">
                <div className="font-display text-[17px] text-ink">{c.name}</div>
                <span className="text-copper opacity-0 transition group-hover:opacity-100">→</span>
              </div>
              <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">{c.note}</div>
            </a>
          ))}
        </div>
      </section>

      {/* Deals */}
      <section className="border-y border-line bg-surface/50">
        <div className="mx-auto max-w-[1440px] px-5 py-16 lg:px-10 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="eyebrow">The edit · limited</span>
              <h2 className="mt-2 font-display text-3xl text-ink lg:text-4xl">This week&apos;s selection</h2>
              <p className="mt-2 max-w-md text-sm text-muted">A few pieces we can stand behind, at prices worth moving on.</p>
            </div>
            <a href="/deals" className="text-[10px] font-bold uppercase tracking-[0.16em] text-copper transition hover:text-ink">View all deals →</a>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 md:gap-x-6">
            {deals.map((p, i) => <ProductCard key={p.slug || p.id} p={p} priority={i < 2} />)}
          </div>
        </div>
      </section>

      {/* Bestsellers */}
      <section className="mx-auto max-w-[1440px] px-5 py-16 lg:px-10 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow">Proven in the workshop</span>
            <h2 className="mt-2 font-display text-3xl text-ink lg:text-4xl">Most considered</h2>
          </div>
          <a href="/category/all" className="text-[10px] font-bold uppercase tracking-[0.16em] text-copper transition hover:text-ink">All products →</a>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
          {products.slice(0, 8).map((p) => <ProductCard key={p.slug || p.id} p={p} />)}
        </div>
      </section>

      {/* The people */}
      <section id="people" className="scroll-mt-24 bg-ink text-paper">
        <div className="mx-auto grid max-w-[1440px] items-center gap-14 px-5 py-16 lg:grid-cols-[0.95fr_1.05fr] lg:gap-20 lg:px-10 lg:py-24">
          <div className="relative">
            <div className="overflow-hidden rounded-[2.5rem]">
              <img src="/images/workshop-wide.jpg" alt="A craftsman laying out a solid teak dining table in the workshop" className="aspect-[4/5] w-full object-cover" loading="lazy" />
            </div>
            <div className="absolute -bottom-7 -right-4 hidden w-40 overflow-hidden rounded-3xl border-[5px] border-ink bg-ink sm:block lg:-right-8">
              <img src="/images/workshop-hands.jpg" alt="Hands polishing a teak surface" className="aspect-square w-full object-cover" loading="lazy" />
            </div>
            <div className="absolute left-5 top-5 rounded-full bg-ink/60 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-paper/90 backdrop-blur">
              Inside the workshop · Pune
            </div>
          </div>

          <div>
            <span className="eyebrow">The people behind your order</span>
            <h2 className="mt-4 font-display text-[clamp(2.5rem,4.4vw,4rem)] leading-[1.02] tracking-[-0.035em]">
              A small team.<br />Every order touched by hand.
            </h2>
            <p className="mt-6 max-w-xl text-[15px] leading-[1.85] text-paper/65">
              We are a workshop and a store, not a marketplace. The person who answers your
              WhatsApp can walk to the shelf and check the machine you are asking about.
            </p>

            <div className="mt-9 divide-y divide-paper/10 border-y border-paper/10">
              {[
                ['Karthik', 'Founder & buyer', '“I run the machines before we list them. If I would not use it, we do not sell it.”'],
                ['Meera', 'Finishing & quality', '“Every teak piece is inspected twice — once at the bench, once before packing.”'],
                ['Arjun', 'Customer care', '“You get me on WhatsApp, not a script. Before and after the sale.”'],
              ].map(([name, role, line]) => (
                <div key={name} className="grid gap-1 py-4 sm:grid-cols-[130px_1fr] sm:gap-6">
                  <div>
                    <div className="font-display text-lg text-paper">{name}</div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-copper">{role}</div>
                  </div>
                  <p className="text-sm leading-relaxed text-paper/60">{line}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a href={waLink('Hi, I would like some advice from the team.')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-paper px-6 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-ink transition hover:bg-copper hover:text-white">
                Talk to the team →
              </a>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-paper/40">Mon–Sat · 9am–7pm IST</span>
            </div>
          </div>
        </div>
      </section>

      {/* Brands */}
      <section className="mx-auto max-w-[1440px] px-5 py-16 lg:px-10 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="eyebrow">Chosen, not stocked blindly</span>
            <h2 className="mt-2 font-display text-3xl text-ink lg:text-4xl">Brands we trust</h2>
          </div>
          <a href="/brands" className="text-[10px] font-bold uppercase tracking-[0.16em] text-copper transition hover:text-ink">View all brands →</a>
        </div>
        <div className="mt-6 flex flex-wrap gap-2.5">
          {brands.map((b) => (
            <a key={b} href={`/brand/${encodeURIComponent(b)}`} className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-muted transition hover:border-copper hover:text-copper">
              {b}
            </a>
          ))}
        </div>
      </section>

      {recent.length > 0 ? (
        <section className="mx-auto max-w-[1440px] px-5 pb-16 lg:px-10">
          <div className="flex items-end justify-between gap-4 border-t border-line pt-12">
            <div>
              <span className="eyebrow">Pick up where you left off</span>
              <h2 className="mt-2 font-display text-3xl text-ink">Recently viewed</h2>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 lg:gap-x-6">
            {recent.slice(0, 4).map((p) => <ProductCard key={p.slug} p={p} />)}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-[1440px] px-5 pb-4 lg:px-10">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[2rem] border border-line bg-copper-light/60 px-7 py-8 sm:flex-row sm:items-center lg:px-10">
          <div>
            <div className="eyebrow">Not sure what you need?</div>
            <p className="mt-2 font-display text-2xl text-ink">Tell us what you are building. We will tell you what to buy.</p>
          </div>
          <a href="/contact-us" className="btn-outline shrink-0">Ask a human →</a>
        </div>
      </section>
    </div>
  );
}
