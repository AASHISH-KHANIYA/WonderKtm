import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useCart, useQuote } from '@/context/CartContext';
import { Seo } from '@/components/Seo';
import { Alert, Button, EmptyState, Input, Spinner } from '@/components/ui';
import { ApiError } from '@/services/api';
import { img, money } from '@/utils/format';

export default function Cart() {
  const cart = useCart();
  const q = useQuote({ currency: 'NPR' });
  const [code, setCode] = useState(cart.coupon);
  const quote = q.data;
  const err = q.error instanceof ApiError ? q.error : null;

  if (cart.items.length === 0) return <div className="container-x py-16"><Seo title="Your cart" noindex /><EmptyState title="Your cart is empty" text="Find something you love and it will show up here." action={<Link to="/shop" className="btn-primary mt-2">Continue shopping</Link>} /></div>;
  return (
    <div className="container-x py-10">
      <Seo title="Your cart" noindex />
      <h1 className="text-4xl sm:text-5xl">Your cart</h1>
      {err && <div className="mt-4"><Alert tone="warn">{err.message} Adjust or remove the item below to continue.</Alert></div>}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <ul className="space-y-4">
          {cart.items.map((i) => {
            const line = quote?.lines.find((l) => l.productId === i.productId && (l.variantId ?? '') === (i.variantId ?? ''));
            return (
              <li key={`${i.productId}-${i.variantId}`} className="card flex gap-4 p-4">
                <Link to={`/product/${i.slug}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-cream"><img src={img(line?.image ?? i.image)} alt="" className="h-full w-full object-cover" /></Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex justify-between gap-3"><div><Link to={`/product/${i.slug}`} className="font-semibold text-navy hover:underline">{i.name}</Link>{(line?.variantLabel ?? i.variantName) && <p className="text-xs text-muted">{line?.variantLabel ?? i.variantName}</p>}</div>
                    <button onClick={() => cart.remove(i.productId, i.variantId)} aria-label={`Remove ${i.name}`} className="h-8 w-8 shrink-0 rounded-full p-1.5 text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="h-full w-full" /></button></div>
                  <div className="mt-auto flex items-end justify-between pt-3">
                    <div className="flex items-center rounded-full border border-line" role="group" aria-label={`Quantity for ${i.name}`}>
                      <button className="p-2" aria-label="Decrease quantity" onClick={() => cart.setQty(i.productId, i.variantId, i.quantity - 1)}><Minus className="h-4 w-4" /></button>
                      <span className="w-7 text-center text-sm font-semibold">{i.quantity}</span>
                      <button className="p-2" aria-label="Increase quantity" onClick={() => cart.setQty(i.productId, i.variantId, i.quantity + 1)}><Plus className="h-4 w-4" /></button>
                    </div>
                    <div className="text-right text-sm">{line && <><div className="font-semibold text-navy">{money(line.lineTotal)}</div>{line.listPrice > line.unitPrice && <div className="text-xs text-muted line-through">{money(line.listPrice * line.quantity)}</div>}</>}</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <aside className="card h-fit space-y-4 p-6 lg:sticky lg:top-28">
          <h2 className="text-2xl">Summary</h2>
          <form onSubmit={(e) => { e.preventDefault(); cart.setCoupon(code.trim().toUpperCase()); }} className="flex gap-2">
            <label className="sr-only" htmlFor="coupon">Coupon code</label><Input id="coupon" placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value)} />
            <Button type="submit" variant="outline">Apply</Button>
          </form>
          {quote?.couponError && <Alert>{quote.couponError}</Alert>}
          {quote?.coupon && <Alert tone="success">Coupon <b>{quote.coupon.code}</b> applied. <button className="underline" onClick={() => { cart.setCoupon(''); setCode(''); }}>Remove</button></Alert>}
          {q.isFetching && !quote ? <Spinner /> : quote && (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{money(quote.totals.subtotal)}</dd></div>
              {quote.totals.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd>−{money(quote.totals.discount)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">Shipping</dt><dd className="text-muted">Calculated at checkout</dd></div>
              <div className="flex justify-between border-t border-line pt-3 text-base font-bold text-navy"><dt>Estimated total</dt><dd>{money(quote.totals.total)}</dd></div>
            </dl>
          )}
          <Link to="/checkout" className={`btn-primary w-full ${err ? 'pointer-events-none opacity-50' : ''}`} aria-disabled={!!err}>Checkout</Link>
          <Link to="/shop" className="block text-center text-sm font-semibold text-brand hover:underline">Continue shopping</Link>
        </aside>
      </div>
    </div>
  );
}
