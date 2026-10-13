import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import clsx from 'clsx';
import type { Product } from '@/types';
import { img, money } from '@/utils/format';
import { useWishlist } from '@/hooks/useWishlist';

export function PriceBlock({ p, size = 'sm' }: { p: Product; size?: 'sm' | 'lg' }) {
  const ranged = p.variants.length > 0 && p.priceFrom !== p.priceTo;
  return (
    <div className={clsx('flex flex-wrap items-baseline gap-x-2', size === 'lg' ? 'text-xl' : 'text-sm')}>
      <span className="font-semibold text-navy">{ranged ? `From ${money(p.priceFrom)}` : money(p.salePrice ?? p.priceFrom)}</span>
      {p.salePrice != null && !ranged && <span className="text-muted line-through">{money(p.price)}</span>}
      {p.salePrice != null && !ranged && <span className="rounded bg-gold/40 px-1.5 py-0.5 text-[11px] font-bold text-navy">-{Math.round((1 - p.salePrice / p.price) * 100)}%</span>}
    </div>
  );
}

export function ProductCard({ p }: { p: Product }) {
  const w = useWishlist();
  const on = w.has(p.id);
  const primary = p.images.find((i) => i.isPrimary) ?? p.images[0];
  return (
    <article className="group relative">
      <Link to={`/product/${p.slug}`} className="block">
        <div className="relative aspect-square overflow-hidden rounded-xl2 bg-white">
          <img src={img(primary?.url)} alt={primary?.alt || p.name} loading="lazy" decoding="async" width={600} height={600} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          <div className="absolute left-3 top-3 flex flex-col gap-1.5">
            {p.isNewArrival && <span className="rounded-full bg-navy px-2.5 py-0.5 text-[11px] font-semibold text-white">New</span>}
            {!p.inStock && <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-muted shadow-soft">Sold out</span>}
          </div>
        </div>
        <h3 className="mt-3 line-clamp-2 font-sans text-sm font-semibold leading-snug text-ink">{p.name}</h3>
        <div className="mt-1"><PriceBlock p={p} /></div>
      </Link>
      <button onClick={() => w.toggle(p.id)} aria-pressed={on} aria-label={on ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-navy shadow-soft transition hover:scale-105">
        <Heart className={clsx('h-4.5 w-4.5', on && 'fill-red-500 text-red-500')} size={18} />
      </button>
    </article>
  );
}

export const ProductGridSkeleton = ({ n = 8 }: { n?: number }) => (
  <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">{Array.from({ length: n }).map((_, i) => <div key={i}><div className="skeleton aspect-square" /><div className="skeleton mt-3 h-4 w-3/4" /><div className="skeleton mt-2 h-4 w-1/3" /></div>)}</div>
);
