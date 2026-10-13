import { useEffect, useId, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, ShieldCheck, Truck } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/services/api';
import { useSite } from '@/context/SiteContext';
import { ProductCard, ProductGridSkeleton } from '@/components/ProductCard';
import { Seo } from '@/components/Seo';
import type { Category, Paged, Product } from '@/types';
import { img } from '@/utils/format';

interface HomeContent {
  hero?: { headline?: string; subheadline?: string; ctaLabel?: string; ctaLink?: string; secondaryLabel?: string; secondaryLink?: string; image?: string };
  sections?: { type: string; enabled: boolean; title?: string; collection?: string }[];
  trust?: { title: string; text: string }[];
}
const DEFAULT_SECTIONS: NonNullable<HomeContent['sections']> = ['categories', 'newArrivals', 'offers', 'bestSellers', 'featured', 'about', 'trust'].map((type) => ({ type, enabled: true, title: '' }));

const pieces = (n: number) => (n > 0 ? `${n} ${n === 1 ? 'piece' : 'pieces'}` : 'Browse');

/* ---------- Gallery wall (hero) ---------- */

/** Frame sizes in hanging order. Widths are tuned so frames wrap two-per-row on phones and three-per-row from `sm`. */
const SLOTS = [
  { w: 'w-[42%] sm:w-[27%]', a: 'aspect-[3/4]', brass: false },
  { w: 'w-[50%] sm:w-[38%]', a: 'aspect-[4/3]', brass: true },
  { w: 'w-[38%] sm:w-[21%]', a: 'aspect-square', brass: false },
  { w: 'w-[46%] sm:w-[24%]', a: 'aspect-[4/5]', brass: false },
  { w: 'w-[50%] sm:w-[34%]', a: 'aspect-[3/2]', brass: false },
  { w: 'w-[40%] sm:w-[25%]', a: 'aspect-square', brass: true },
  { w: 'w-[56%] sm:w-[30%]', a: 'aspect-[16/10]', brass: false },
];

function kathmanduTime(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { h: get('hour') % 24, m: get('minute') };
}

/** An analogue clock set to Kathmandu time. Shown in the Clocks frame. */
function KathmanduClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 20_000); return () => clearInterval(t); }, []);
  const { h, m } = kathmanduTime(now);
  const spoken = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  return (
    <svg viewBox="0 0 100 100" className="h-[82%] w-[82%]" role="img" aria-label={`Clock showing ${spoken} in Kathmandu`}>
      <circle cx="50" cy="50" r="47" fill="rgb(var(--c-mount))" stroke="rgb(var(--c-navy))" strokeWidth="2.5" />
      {Array.from({ length: 12 }).map((_, i) => (
        <line key={i} x1="50" y1={i % 3 === 0 ? 8 : 10} x2="50" y2="15" stroke="rgb(var(--c-navy))" strokeWidth={i % 3 === 0 ? 3 : 1.5} strokeLinecap="round" transform={`rotate(${i * 30} 50 50)`} />
      ))}
      <text x="50" y="68" textAnchor="middle" fontSize="7" fontFamily="Manrope, system-ui, sans-serif" fill="rgb(var(--c-ink))">Kathmandu</text>
      <line x1="50" y1="50" x2="50" y2="28" stroke="rgb(var(--c-navy))" strokeWidth="4" strokeLinecap="round" transform={`rotate(${(h % 12) * 30 + m * 0.5} 50 50)`} />
      <line x1="50" y1="50" x2="50" y2="17" stroke="rgb(var(--c-navy))" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${m * 6} 50 50)`} />
      <circle cx="50" cy="50" r="3.5" fill="rgb(var(--c-yellow))" />
    </svg>
  );
}

type WallItem = { kind: 'hero'; src: string } | { kind: 'category'; cat: Category };

function GalleryWall({ cats, heroImage }: { cats: Category[]; heroImage?: string }) {
  const items: WallItem[] = cats.map((cat) => ({ kind: 'category', cat }));
  if (heroImage) items.splice(1, 0, { kind: 'hero', src: heroImage });
  const hung = items.slice(0, SLOTS.length);
  if (!hung.length) return null;
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-16 pb-14 sm:gap-x-6" aria-label="Shop by category">
      {hung.map((it, i) => {
        const s = SLOTS[i];
        const style: CSSProperties = { animationDelay: `${120 + i * 70}ms` };
        if (it.kind === 'hero') {
          return (
            <li key="hero" className={clsx('hang', s.w)} style={style} aria-hidden>
              <div className={clsx('frame', s.a, s.brass && 'frame-brass')}><div className="frame-mount"><img src={it.src} alt="" className="h-full w-full object-cover" /></div></div>
            </li>
          );
        }
        const c = it.cat;
        const isClock = /clock/i.test(c.slug);
        return (
          <li key={c.id} className={clsx('hang', s.w)} style={style}>
            <Link to={`/category/${c.slug}`} className="frame-link relative block">
              <div className={clsx('frame', s.a, s.brass && 'frame-brass')}>
                <div className="frame-mount">
                  {isClock ? <KathmanduClock />
                    : c.image ? <img src={img(c.image.url)} alt="" loading={i < 3 ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" />
                    : <span aria-hidden className="frame-title px-[8%] text-center font-display leading-tight text-navy/80">{c.name}</span>}
                </div>
              </div>
              <span className="absolute inset-x-0 top-full mt-3 block text-[13px] leading-snug">
                <span className="frame-name block font-semibold text-ink">{c.name}</span>
                <span className="block text-ink/75">{pieces(c.productCount)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Hero({ hero, cats, promise }: { hero: NonNullable<HomeContent['hero']>; cats: Category[]; promise?: string }) {
  const headline = hero.headline || 'Discover Delight Repeat.';
  const words = headline.split(/\s+/);
  return (
    <section className="bg-wall">
      <div className="container-x grid items-center gap-x-12 gap-y-14 pb-6 pt-12 sm:pt-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:pb-10 lg:pt-20">
        <div className="max-w-xl">
          {/* Short headlines (like the tagline) are set one word per line. */}
          <h1 className="text-[clamp(2.75rem,7vw,5.25rem)] leading-[0.98] text-navy">
            {words.length <= 4 ? words.map((w, i) => <span key={i} className="block">{w}</span>) : headline}
          </h1>
          {hero.subheadline && <p className="mt-6 max-w-md text-lg leading-relaxed text-ink">{hero.subheadline}</p>}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to={hero.ctaLink || '/shop'} className="btn-primary px-7 py-3.5 text-[15px]">{hero.ctaLabel || 'Shop now'}</Link>
            {hero.secondaryLabel && <Link to={hero.secondaryLink || '/shop'} className="btn border border-navy/30 px-7 py-3.5 text-[15px] text-navy hover:border-navy hover:bg-white/50">{hero.secondaryLabel}</Link>}
          </div>
          {promise && <p className="mt-6 flex items-center gap-2 text-sm text-ink"><Truck className="h-4 w-4 text-brand" aria-hidden />{promise}</p>}
        </div>
        <GalleryWall cats={cats} heroImage={hero.image} />
      </div>
    </section>
  );
}

/* ---------- Sections ---------- */

function Row({ title, params, to }: { title: string; params: Record<string, unknown>; to?: string }) {
  const id = useId();
  const q = useQuery({ queryKey: ['home-row', params], queryFn: () => api.get<Paged<Product>>('/products', { limit: 4, ...params }), staleTime: 60_000 });
  if (!q.isLoading && !q.data?.items.length) return null;
  return (
    <section aria-labelledby={id} className="container-x">
      <div className="mb-8 flex items-baseline justify-between gap-4 border-b border-line pb-4">
        <h2 id={id} className="text-3xl sm:text-4xl">{title}</h2>
        {to && q.data && <Link to={to} className="shrink-0 text-sm font-semibold text-brand underline-offset-4 hover:underline">View all {q.data.total}<span className="sr-only"> in {title}</span></Link>}
      </div>
      {q.isLoading ? <ProductGridSkeleton n={4} /> : <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-4">{q.data!.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
    </section>
  );
}

function CategoryIndex({ title, cats }: { title: string; cats: Category[] }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="container-x">
      <h2 id={id} className="text-3xl sm:text-4xl">{title}</h2>
      <ul className="mt-6 grid border-t border-line md:grid-cols-2 md:gap-x-16">
        {cats.map((c) => (
          <li key={c.id} className="border-b border-line">
            <Link to={`/category/${c.slug}`} className="group flex items-baseline gap-4 py-4 sm:py-5">
              <span className="font-display text-2xl text-navy transition-colors group-hover:text-brand sm:text-[1.75rem]">{c.name}</span>
              <span aria-hidden className="flex-1 -translate-y-1 border-b border-dotted border-ink/25 transition-colors group-hover:border-gold" />
              <span className="shrink-0 text-sm tabular-nums text-muted">{pieces(c.productCount)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function About({ title, body, address }: { title: string; body: string; address?: string }) {
  const id = useId();
  const cut = body.length > 480 ? `${body.slice(0, body.lastIndexOf(' ', 480)).trimEnd()}…` : body;
  return (
    <section aria-labelledby={id} className="container-x">
      <div className="grid gap-8 border-t border-line pt-10 md:grid-cols-[5fr_7fr] md:gap-16">
        <div>
          <h2 id={id} className="text-4xl sm:text-5xl">{title}</h2>
          {address && <p className="mt-5 flex max-w-xs gap-2 text-sm leading-6 text-muted"><MapPin className="mt-1 h-4 w-4 shrink-0 text-brand" aria-hidden />{address}</p>}
        </div>
        <div className="max-w-[65ch]">
          <p className="prose-wk whitespace-pre-line text-base leading-8">{cut}</p>
          <Link to="/about" className="mt-5 inline-block text-sm font-semibold text-brand underline underline-offset-4 hover:text-navy">Read our story</Link>
        </div>
      </div>
    </section>
  );
}

function Trust({ title, items }: { title: string; items: { title: string; text: string }[] }) {
  const id = useId();
  const icons = [Truck, ShieldCheck, Clock];
  return (
    <section aria-labelledby={id} className="container-x">
      <h2 id={id} className="sr-only">{title}</h2>
      <ul className="grid gap-8 border-y border-line py-10 md:grid-cols-3 md:gap-12">
        {items.map((x, i) => {
          const I = icons[i % icons.length];
          return (
            <li key={i} className="flex gap-4">
              <I className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
              <div><h3 className="font-sans text-[15px] font-semibold text-navy">{x.title}</h3><p className="mt-1 text-sm leading-6 text-muted">{x.text}</p></div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- Page ---------- */

export default function Home() {
  const { site } = useSite();
  const content = useQuery({ queryKey: ['content', 'homepage'], queryFn: () => api.get<{ content: HomeContent | null }>('/content/homepage') });
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ items: Category[] }>('/categories'), staleTime: 120_000 });
  const about = useQuery({ queryKey: ['content', 'about'], queryFn: () => api.get<{ content: { title?: string; body?: string } | null }>('/content/about') });
  const c = content.data?.content ?? {};
  const hero = c.hero ?? {};
  const sections = (c.sections?.length ? c.sections : DEFAULT_SECTIONS).filter((s) => s.enabled);
  const topCats = (cats.data?.items ?? []).filter((x) => !x.parent && x.showOnHome);
  const social = Object.entries(site?.business.social ?? {}).filter(([, v]) => v);

  const render = (s: (typeof sections)[number]) => {
    const t = s.title;
    switch (s.type) {
      case 'categories': return topCats.length > 0 && <CategoryIndex key="cats" title={t || 'Shop by category'} cats={topCats} />;
      case 'newArrivals': return <Row key="new" title={t || 'New arrivals'} params={{ isNew: '1', sort: 'newest' }} to="/shop?sort=newest" />;
      case 'bestSellers': return <Row key="best" title={t || 'Best sellers'} params={{ sort: 'popular' }} to="/shop?sort=popular" />;
      case 'featured': return <Row key="feat" title={t || 'Featured'} params={{ featured: '1' }} to="/shop?sort=featured" />;
      case 'offers': return <Row key="offers" title={t || 'Special offers'} params={{ onSale: '1' }} to="/shop?onSale=1" />;
      case 'collection': return s.collection ? <Row key={`col-${s.collection}`} title={t || s.collection} params={{ collection: s.collection }} to={`/shop?collection=${encodeURIComponent(s.collection)}`} /> : null;
      case 'about': {
        const a = about.data?.content;
        return a?.body ? <About key="about" title={t || a.title || 'About us'} body={a.body} address={site?.business.address} /> : null;
      }
      case 'trust': return (c.trust?.length ?? 0) > 0 && <Trust key="trust" title={t || 'Why shop with us'} items={c.trust!} />;
      case 'social': return social.length > 0 && (
        <section key="social" className="container-x text-center"><h2 className="text-3xl">{t || 'Follow us'}</h2><div className="mt-5 flex flex-wrap justify-center gap-3">{social.map(([k, v]) => <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="btn-outline capitalize">{k}</a>)}</div></section>
      );
      default: return null;
    }
  };

  return (
    <>
      <Seo />
      <Hero hero={hero} cats={topCats} promise={c.trust?.[0]?.title} />
      <div className="flex flex-col gap-20 pt-16 sm:gap-24 sm:pt-20">{sections.map(render)}</div>
    </>
  );
}
