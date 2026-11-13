import { isProductShot } from '../lib/image';

function discountPercent(p) {
  if (!p.mrp || Number(p.mrp) <= Number(p.price)) return 0;
  return Math.round(((Number(p.mrp) - Number(p.price)) / Number(p.mrp)) * 100);
}

// One editorial product card used by the homepage, category, brand and deals listings.
// No boxed border: the photograph is the object, with quiet metadata underneath.
export default function ProductCard({ p, priority = false }) {
  const img = p.image || p.images?.[0] || '/images/placeholder.svg';
  const off = discountPercent(p);
  const out = p.stock === 0;
  return (
    <a href={`/product/${p.slug || p.id}`} data-testid="product-card" className="group block">
      <div className="relative overflow-hidden rounded-3xl bg-[#EFE5D7]">
        <div className="aspect-[4/5] w-full">
          <img
            src={img}
            alt={p.name}
            loading={priority ? 'eager' : 'lazy'}
            className={`h-full w-full transition duration-700 ease-out group-hover:scale-[1.035] ${isProductShot(img) ? 'object-contain p-6 mix-blend-multiply' : 'object-cover'}`}
          />
        </div>
        {off > 0 ? (
          <span className="absolute left-3 top-3 rounded-full bg-paper/95 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-ink backdrop-blur">
            −{off}%
          </span>
        ) : null}
        {out ? (
          <span className="absolute left-3 bottom-3 rounded-full bg-ink/90 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-paper">
            Out of stock
          </span>
        ) : null}
        <span className="pointer-events-none absolute bottom-3 right-3 translate-y-2 rounded-full bg-ink/90 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-paper opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          View piece →
        </span>
      </div>
      <div className="mt-3.5">
        <div data-testid="product-brand" className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted">{p.brand || 'E-Commerce'}</div>
        <div className="mt-1.5 text-[13.5px] font-semibold leading-snug text-ink line-clamp-2">{p.name}</div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-[19px] leading-none text-ink">₹{Number(p.price).toLocaleString('en-IN')}</span>
          {p.mrp && Number(p.mrp) > Number(p.price) ? (
            <span className="text-[10px] text-muted line-through">₹{Number(p.mrp).toLocaleString('en-IN')}</span>
          ) : null}
        </div>
      </div>
    </a>
  );
}
