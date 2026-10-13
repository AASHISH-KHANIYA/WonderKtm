import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal, X } from 'lucide-react';
import { api } from '@/services/api';
import { ProductCard, ProductGridSkeleton } from '@/components/ProductCard';
import { Seo } from '@/components/Seo';
import { Button, EmptyState, Field, Input, Pagination, Select } from '@/components/ui';
import type { Category, Paged, Product } from '@/types';

type Resp = Paged<Product> & { category: (Category & { banner?: { url: string } }) | null };

export default function Shop() {
  const { slug } = useParams();
  const [sp, setSp] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const get = (k: string) => sp.get(k) ?? '';
  const sub = get('sub');
  const categorySlug = sub || slug || get('category');
  const params = { q: get('q'), category: categorySlug, minPrice: get('minPrice'), maxPrice: get('maxPrice'), inStock: get('inStock'), sort: get('sort') || 'featured', page: Number(get('page') || 1), collection: get('collection'), onSale: get('onSale'), limit: 12 };
  const q = useQuery({ queryKey: ['products', params], queryFn: () => api.get<Resp>('/products', params), placeholderData: (p) => p });
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ items: Category[] }>('/categories'), staleTime: 120_000 });
  const all = cats.data?.items ?? [];
  const current = slug ? all.find((c) => c.slug === slug) : undefined;
  const children = current ? all.filter((c) => c.parent === current.id) : [];
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); n.delete('page'); setSp(n, { replace: true }); };
  const [min, setMin] = useState(get('minPrice')); const [max, setMax] = useState(get('maxPrice'));
  useEffect(() => { setMin(get('minPrice')); setMax(get('maxPrice')); }, [sp]);
  const active = [get('q') && `Search: ${get('q')}`, sub && `Subcategory: ${all.find((c) => c.slug === sub)?.name ?? sub}`, get('minPrice') && `Min ${get('minPrice')}`, get('maxPrice') && `Max ${get('maxPrice')}`, get('inStock') && 'In stock', get('onSale') && 'On sale', get('collection') && `Collection: ${get('collection')}`].filter(Boolean) as string[];
  const clear = () => setSp(new URLSearchParams(), { replace: true });
  const title = current?.name ?? (get('q') ? `Results for “${get('q')}”` : 'Shop all');
  const banner = q.data?.category?.banner;

  const Filters = (
    <div className="space-y-6">
      {!slug && <Field label="Category"><Select value={get('category')} onChange={(e) => set('category', e.target.value)}><option value="">All categories</option>{all.filter((c) => !c.parent).map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</Select></Field>}
      {children.length > 0 && <Field label="Subcategory"><Select value={sub} onChange={(e) => set('sub', e.target.value)}><option value="">All</option>{children.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</Select></Field>}
      <div><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy/80">Price (NPR)</span>
        <div className="flex items-center gap-2"><Input inputMode="numeric" aria-label="Minimum price" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} onBlur={() => set('minPrice', min)} /><span className="text-muted">–</span><Input inputMode="numeric" aria-label="Maximum price" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} onBlur={() => set('maxPrice', max)} /></div></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-navy))]" checked={!!get('inStock')} onChange={(e) => set('inStock', e.target.checked ? '1' : '')} /> In stock only</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-navy))]" checked={!!get('onSale')} onChange={(e) => set('onSale', e.target.checked ? '1' : '')} /> On sale</label>
    </div>
  );

  return (
    <div className="container-x pb-8 pt-8">
      <Seo title={q.data?.category?.seo?.title || title} description={q.data?.category?.seo?.description || current?.description || undefined} noindex={!!get('q') || active.length > 0} />
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted"><Link to="/" className="hover:text-navy">Home</Link> / <Link to="/shop" className="hover:text-navy">Shop</Link>{current && <> / <span className="text-navy">{current.name}</span></>}</nav>
      {banner && <img src={banner.url} alt="" className="mb-6 h-40 w-full rounded-xl2 object-cover sm:h-56" />}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-4xl sm:text-5xl">{title}</h1>{current?.description && <p className="mt-2 max-w-2xl text-sm text-muted">{current.description}</p>}{q.data && <p className="mt-1 text-sm text-muted">{q.data.total} product{q.data.total === 1 ? '' : 's'}</p>}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}><SlidersHorizontal className="h-4 w-4" /> Filters</Button>
          <label className="sr-only" htmlFor="sort">Sort by</label>
          <Select id="sort" className="w-44" value={params.sort} onChange={(e) => set('sort', e.target.value)}><option value="featured">Featured</option><option value="newest">Newest</option><option value="popular">Most popular</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></Select>
        </div>
      </div>
      {active.length > 0 && <div className="mb-5 flex flex-wrap items-center gap-2">{active.map((a) => <span key={a} className="rounded-full bg-navy/5 px-3 py-1 text-xs font-medium text-navy">{a}</span>)}<button onClick={clear} className="text-xs font-semibold text-brand underline">Clear filters</button></div>}
      <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">{Filters}</aside>
        <div>
          {q.isLoading ? <ProductGridSkeleton n={8} /> : q.isError ? <EmptyState title="We couldn’t load products" text="Please check your connection and try again." action={<Button onClick={() => q.refetch()}>Retry</Button>} />
            : q.data!.items.length === 0 ? <EmptyState title="No products found" text={active.length ? 'Try removing a filter or searching for something else.' : 'New products are on the way.'} action={active.length ? <Button onClick={clear}>Clear filters</Button> : undefined} />
            : <><div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">{q.data!.items.map((p) => <ProductCard key={p.id} p={p} />)}</div><Pagination page={q.data!.page} pages={q.data!.pages} onChange={(p) => { const n = new URLSearchParams(sp); n.set('page', String(p)); setSp(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }} /></>}
        </div>
      </div>
      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters"><div className="absolute inset-0 bg-navy/50" onClick={() => setFiltersOpen(false)} />
          <div className="absolute inset-y-0 right-0 w-[86%] max-w-sm overflow-y-auto bg-cream p-5"><div className="mb-5 flex items-center justify-between"><h2 className="text-2xl">Filters</h2><button aria-label="Close filters" onClick={() => setFiltersOpen(false)}><X className="h-5 w-5" /></button></div>{Filters}<div className="mt-6 flex gap-2"><Button className="flex-1" onClick={() => setFiltersOpen(false)}>Show results</Button><Button variant="outline" onClick={clear}>Clear</Button></div></div></div>
      )}
    </div>
  );
}
