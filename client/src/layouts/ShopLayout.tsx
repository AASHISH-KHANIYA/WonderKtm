import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart, Menu, Search, ShoppingBag, User as UserIcon, X } from 'lucide-react';
import { api } from '@/services/api';
import { useSite } from '@/context/SiteContext';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import type { Category } from '@/types';
import { PageLoader } from '@/components/ui';

export const Logo = ({ light }: { light?: boolean }) => {
  const { site } = useSite();
  if (site?.business.logoUrl) return <img src={site.business.logoUrl} alt={site.business.name} className="h-9 w-auto" />;
  return <span className={`font-display text-[28px] tracking-tight ${light ? 'text-white' : 'text-navy'}`}>Wonder<span className={light ? 'text-gold' : 'text-brand'}>ktm</span></span>;
};

function SearchBox({ onDone }: { onDone?: () => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const sg = useQuery({ queryKey: ['suggest', q], queryFn: () => api.get<{ products: { name: string; slug: string; image?: string; price: number }[]; categories: { name: string; slug: string }[] }>('/search/suggest', { q }), enabled: q.trim().length >= 2, staleTime: 30_000 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false); document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const go = (e: React.FormEvent) => { e.preventDefault(); if (q.trim()) { nav(`/shop?q=${encodeURIComponent(q.trim())}`); setOpen(false); onDone?.(); } };
  return (
    <div ref={ref} className="relative w-full">
      <form onSubmit={go} role="search"><label className="sr-only" htmlFor="site-search">Search products</label>
        <input id="site-search" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search décor, lamps, gifts…" autoComplete="off" className="input rounded-full pl-10" />
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </form>
      {open && q.trim().length >= 2 && sg.data && (sg.data.products.length > 0 || sg.data.categories.length > 0) && (
        <div className="card absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden p-2">
          {sg.data.categories.map((c) => <Link key={c.slug} to={`/category/${c.slug}`} onClick={() => { setOpen(false); onDone?.(); }} className="block rounded-lg px-3 py-2 text-sm hover:bg-navy/5">In <b>{c.name}</b></Link>)}
          {sg.data.products.map((p) => <Link key={p.slug} to={`/product/${p.slug}`} onClick={() => { setOpen(false); onDone?.(); }} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-navy/5"><img src={p.image || '/placeholder.svg'} alt="" className="h-9 w-9 rounded object-cover" /><span className="line-clamp-1 flex-1">{p.name}</span></Link>)}
        </div>
      )}
    </div>
  );
}

function Header() {
  const { site } = useSite();
  const { user } = useAuth();
  const { count } = useCart();
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenu(false), [loc.pathname]);
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ items: Category[] }>('/categories'), staleTime: 120_000 });
  const top = (cats.data?.items ?? []).filter((c) => !c.parent);
  const ann = site?.announcement;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-cream/95 backdrop-blur">
      {ann?.enabled && ann.text && <div className="bg-navy px-4 py-2 text-center text-xs font-medium tracking-wide text-white">{ann.link ? <Link to={ann.link} className="hover:underline">{ann.text}</Link> : ann.text}</div>}
      <div className="container-x flex h-16 items-center gap-4">
        <button className="btn-ghost -ml-2 p-2 lg:hidden" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}><Menu className="h-5 w-5" /></button>
        <Link to="/" aria-label="Wonderktm home"><Logo /></Link>
        <nav className="ml-6 hidden items-center gap-6 whitespace-nowrap lg:flex" aria-label="Main">
          <NavLink to="/shop" className={({ isActive }) => `text-sm font-semibold ${isActive ? 'text-brand' : 'text-navy hover:text-brand'}`}>Shop all</NavLink>
          {/* Keep the bar on one line: two categories at lg, four at xl; the rest are one click away in Shop all. */}
          {top.slice(0, 4).map((c, i) => <NavLink key={c.id} to={`/category/${c.slug}`} className={({ isActive }) => `text-sm font-medium ${i >= 2 ? 'hidden xl:inline' : ''} ${isActive ? 'text-brand' : 'text-ink/80 hover:text-brand'}`}>{c.name}</NavLink>)}
        </nav>
        <div className="ml-auto hidden w-72 md:block xl:w-80"><SearchBox /></div>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link to="/wishlist" className="btn-ghost p-2" aria-label="Wishlist"><Heart className="h-5 w-5" /></Link>
          <Link to={user ? '/account' : '/login'} className="btn-ghost p-2" aria-label={user ? 'Your account' : 'Sign in'}><UserIcon className="h-5 w-5" /></Link>
          <Link to="/cart" className="btn-ghost relative p-2" aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}><ShoppingBag className="h-5 w-5" />{count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[11px] font-bold text-navy">{count}</span>}</Link>
        </div>
      </div>
      <div className="container-x pb-3 md:hidden"><SearchBox /></div>
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-navy/50" onClick={() => setMenu(false)} />
          <div className="absolute inset-y-0 left-0 w-[82%] max-w-xs overflow-y-auto bg-cream p-5">
            <div className="mb-6 flex items-center justify-between"><Logo /><button onClick={() => setMenu(false)} aria-label="Close menu" className="p-1"><X className="h-5 w-5" /></button></div>
            <nav className="flex flex-col gap-1" aria-label="Mobile">
              {[{ n: 'Shop all', to: '/shop' }, ...top.map((c) => ({ n: c.name, to: `/category/${c.slug}` })), { n: 'About', to: '/about' }, { n: 'Contact', to: '/contact' }, { n: 'Track order', to: '/track' }].map((l) => <Link key={l.to} to={l.to} className="rounded-lg px-3 py-3 text-[15px] font-semibold text-navy hover:bg-navy/5">{l.n}</Link>)}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  const { site } = useSite();
  const pol = useQuery({ queryKey: ['policies'], queryFn: () => api.get<{ items: { slug: string; title: string }[] }>('/policies'), staleTime: 300_000 });
  const b = site?.business;
  const social = Object.entries(b?.social ?? {}).filter(([, v]) => v);
  return (
    <footer className="mt-24 bg-navy text-white/80">
      <div className="container-x grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-1"><Logo light /><p className="mt-3 text-sm italic text-white/70">{b?.tagline}</p><p className="mt-4 text-sm leading-6">{b?.address}</p>{b?.hours && <p className="mt-2 text-sm">{b.hours}</p>}</div>
        <div><h3 className="font-sans text-sm font-semibold text-gold">Explore</h3><ul className="mt-3 space-y-2 text-sm">{(site?.footer?.links ?? [{ label: 'About', href: '/about' }, { label: 'Contact', href: '/contact' }, { label: 'FAQ', href: '/faq' }, { label: 'Track order', href: '/track' }]).map((l) => <li key={l.href}><Link className="hover:text-white" to={l.href}>{l.label}</Link></li>)}</ul></div>
        <div><h3 className="font-sans text-sm font-semibold text-gold">Policies</h3><ul className="mt-3 space-y-2 text-sm">{(pol.data?.items ?? []).map((p) => <li key={p.slug}><Link className="hover:text-white" to={`/policies/${p.slug}`}>{p.title}</Link></li>)}{!pol.data?.items.length && <li className="text-white/50">Policies coming soon.</li>}</ul></div>
        <div><h3 className="font-sans text-sm font-semibold text-gold">Contact</h3><ul className="mt-3 space-y-2 text-sm">{b?.email && <li><a className="hover:text-white" href={`mailto:${b.email}`}>{b.email}</a></li>}{b?.phone && <li><a className="hover:text-white" href={`tel:${b.phone}`}>{b.phone}</a></li>}{!b?.email && !b?.phone && <li className="text-white/50">Contact details coming soon.</li>}{social.map(([k, v]) => <li key={k}><a className="capitalize hover:text-white" href={v} target="_blank" rel="noopener noreferrer">{k}</a></li>)}</ul></div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/50">© {new Date().getFullYear()} {b?.name ?? 'Wonderktm'}. All rights reserved.</div>
    </footer>
  );
}

export default function ShopLayout() {
  const { site, loading } = useSite();
  const { isStaff } = useAuth();
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  if (loading) return <PageLoader />;
  if (site?.maintenanceMode && !isStaff && !loc.pathname.startsWith('/login'))
    return <div className="grid min-h-screen place-items-center px-6 text-center"><div><Logo /><h1 className="mt-6 text-4xl">Back soon</h1><p className="mt-2 text-muted">{site.maintenanceMessage}</p></div></div>;
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:p-3">Skip to content</a>
      <Header />
      <main id="main" className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}
