import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Heart, Minus, Plus, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import clsx from 'clsx';
import { api, ApiError } from '@/services/api';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/hooks/useWishlist';
import { PriceBlock, ProductCard } from '@/components/ProductCard';
import { Seo } from '@/components/Seo';
import { Alert, Badge, Button, PageLoader, useToast } from '@/components/ui';
import type { Product as P } from '@/types';
import { img, money } from '@/utils/format';

export default function Product() {
  const { slug } = useParams();
  const nav = useNavigate();
  const cart = useCart();
  const toast = useToast();
  const wl = useWishlist();
  const q = useQuery({ queryKey: ['product', slug], queryFn: () => api.get<{ product: P; related: P[] }>(`/products/${slug}`), retry: false });
  const ship = useQuery({ queryKey: ['content', 'shipping-info'], queryFn: () => api.get<{ content: { text?: string } | null }>('/content/shipping-info') });
  const [variantId, setVariantId] = useState<string>();
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);
  useEffect(() => { setVariantId(undefined); setQty(1); setActive(0); }, [slug]);
  const p = q.data?.product;
  const variant = p?.variants.find((v) => v.id === variantId);
  const stock = variant ? variant.stock : p?.variants.length ? 0 : p?.stock ?? 0;
  const ld = useMemo(() => p && ({ '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.sku, description: p.shortDescription || p.description.slice(0, 300), image: p.images.map((i) => new URL(img(i.url), window.location.origin).href), offers: { '@type': 'Offer', priceCurrency: 'NPR', price: p.salePrice ?? p.priceFrom, availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: window.location.href } }), [p]);

  if (q.error instanceof ApiError && q.error.status === 301) return <Navigate to={`/product/${(q.error as any).details?.redirectTo}`} replace />;
  if (q.isLoading) return <PageLoader />;
  if (q.isError || !p) return <div className="container-x py-24 text-center"><h1 className="text-5xl">Product not found</h1><p className="mt-3 text-muted">It may have been removed or the link is out of date.</p><Link to="/shop" className="btn-primary mt-6">Continue shopping</Link></div>;

  const needsVariant = p.variants.length > 0 && !variant;
  const add = (go?: boolean) => {
    if (needsVariant) { toast('error', 'Please choose an option first.'); return; }
    cart.add({ productId: p.id, variantId: variant?.id, quantity: qty, name: p.name, slug: p.slug, image: p.images[0]?.url, variantName: variant?.name });
    if (go) nav('/checkout'); else toast('success', 'Added to your cart.');
  };
  const cat = typeof p.category === 'object' && p.category ? p.category : null;
  const shownPrice = variant ? { ...p, price: variant.price, salePrice: variant.salePrice, priceFrom: variant.salePrice ?? variant.price, priceTo: variant.salePrice ?? variant.price, variants: [] } : p;

  return (
    <div className="container-x pb-8 pt-8">
      <Seo title={p.seo?.title || p.name} description={p.seo?.description || p.shortDescription} image={p.images[0]?.url} jsonLd={ld ?? undefined} />
      <nav aria-label="Breadcrumb" className="mb-5 text-xs text-muted"><Link to="/" className="hover:text-navy">Home</Link> / {cat && <><Link to={`/category/${cat.slug}`} className="hover:text-navy">{cat.name}</Link> / </>}<span className="text-navy">{p.name}</span></nav>
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <div className="aspect-square overflow-hidden rounded-xl2 bg-white"><img src={img(p.images[active]?.url)} alt={p.images[active]?.alt || p.name} className="h-full w-full object-cover" fetchPriority="high" /></div>
          {p.images.length > 1 && <div className="mt-3 grid grid-cols-5 gap-2" role="list">{p.images.map((im, i) => <button key={im.id ?? i} role="listitem" onClick={() => setActive(i)} aria-label={`Show image ${i + 1}`} aria-current={i === active} className={clsx('aspect-square overflow-hidden rounded-lg border-2', i === active ? 'border-navy' : 'border-transparent')}><img src={img(im.url)} alt="" loading="lazy" className="h-full w-full object-cover" /></button>)}</div>}
        </div>
        <div>
          <div className="flex flex-wrap gap-2">{p.isNewArrival && <Badge tone="gold">New</Badge>}{p.onSale && <Badge tone="good">On sale</Badge>}</div>
          <h1 className="mt-2 text-4xl sm:text-5xl">{p.name}</h1>
          <p className="mt-1 text-xs text-muted">SKU: {variant?.sku ?? p.sku}</p>
          <div className="mt-4"><PriceBlock p={shownPrice} size="lg" /></div>
          {p.shortDescription && <p className="mt-4 text-[15px] leading-7 text-ink/80">{p.shortDescription}</p>}
          {p.variants.length > 0 && (
            <fieldset className="mt-6"><legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy/80">Choose an option</legend>
              <div className="flex flex-wrap gap-2">{p.variants.map((v) => <button key={v.id} type="button" disabled={!v.inStock} aria-pressed={variantId === v.id} onClick={() => { setVariantId(v.id); setQty(1); }} className={clsx('rounded-full border px-4 py-2 text-sm font-medium transition', variantId === v.id ? 'border-navy bg-navy text-white' : 'border-line bg-white text-navy hover:border-navy', !v.inStock && 'cursor-not-allowed line-through opacity-40')}>{v.name}</button>)}</div></fieldset>
          )}
          <p className={clsx('mt-5 text-sm font-medium', stock > 0 ? 'text-emerald-700' : needsVariant ? 'text-muted' : 'text-red-600')} role="status">{needsVariant ? (p.inStock ? 'Select an option to see availability' : 'Currently sold out') : stock <= 0 ? 'Sold out' : stock <= 5 ? `Only ${stock} left` : 'In stock'}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-full border border-line bg-white" role="group" aria-label="Quantity">
              <button className="p-3" aria-label="Decrease quantity" onClick={() => setQty((x) => Math.max(1, x - 1))}><Minus className="h-4 w-4" /></button>
              <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{qty}</span>
              <button className="p-3" aria-label="Increase quantity" onClick={() => setQty((x) => Math.min(Math.max(stock, 1), 20, x + 1))}><Plus className="h-4 w-4" /></button>
            </div>
            <Button disabled={stock <= 0 && !needsVariant} onClick={() => add()} className="flex-1 sm:flex-none sm:px-8">Add to cart</Button>
            <Button variant="accent" disabled={stock <= 0 && !needsVariant} onClick={() => add(true)}>Buy now</Button>
            <button onClick={() => wl.toggle(p.id)} aria-pressed={wl.has(p.id)} aria-label="Toggle wishlist" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white"><Heart className={clsx('h-5 w-5', wl.has(p.id) && 'fill-red-500 text-red-500')} /></button>
          </div>
          <div className="mt-8 space-y-3 rounded-xl2 border border-line bg-white p-5 text-sm">
            <div className="flex gap-3"><Truck className="mt-0.5 h-5 w-5 shrink-0 text-brand" /><div><b>Delivery.</b> {ship.data?.content?.text || 'Delivery charge and estimated time are shown at checkout for your address.'}</div></div>
            <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" /><div><b>Payment.</b> Pay by QR and upload your screenshot. We verify every payment manually before confirming your order. <Link className="font-semibold text-brand underline" to="/policies/payment-verification">How it works</Link></div></div>
            <div className="flex gap-3"><RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-brand" /><div><b>Returns.</b> See our <Link className="font-semibold text-brand underline" to="/policies/returns">return and exchange policy</Link>.</div></div>
          </div>
        </div>
      </div>
      <div className="mt-14 grid gap-10 lg:grid-cols-[2fr_1fr]">
        <section><h2 className="text-3xl">Description</h2><div className="prose-wk mt-3 whitespace-pre-line">{p.description || 'No description yet.'}</div>
          {(p.materials || p.careInstructions) && <div className="mt-6 grid gap-4 sm:grid-cols-2">{p.materials && <div className="card p-4"><h3 className="font-sans text-sm font-bold">Materials</h3><p className="mt-1 text-sm text-muted">{p.materials}</p></div>}{p.careInstructions && <div className="card p-4"><h3 className="font-sans text-sm font-bold">Care</h3><p className="mt-1 text-sm text-muted">{p.careInstructions}</p></div>}</div>}</section>
        {(p.dimensions || p.specifications.length > 0) && <section><h2 className="text-3xl">Specifications</h2><dl className="card mt-3 divide-y divide-line text-sm">{p.dimensions && <div className="flex justify-between gap-4 p-3"><dt className="text-muted">Dimensions</dt><dd className="text-right font-medium">{p.dimensions}</dd></div>}{p.specifications.map((s, i) => <div key={i} className="flex justify-between gap-4 p-3"><dt className="text-muted">{s.label}</dt><dd className="text-right font-medium">{s.value}</dd></div>)}</dl></section>}
      </div>
      {q.data!.related.length > 0 && <section className="mt-16"><h2 className="mb-6 text-3xl">You may also like</h2><div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">{q.data!.related.map((r) => <ProductCard key={r.id} p={r} />)}</div></section>}
      {q.isError && <Alert>Could not load product.</Alert>}
      <span className="hidden">{money(0)}</span>
    </div>
  );
}
