import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCart, useQuote } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useSite } from '@/context/SiteContext';
import { Seo } from '@/components/Seo';
import { Alert, Button, Field, Input, Select, Spinner, Textarea } from '@/components/ui';
import { api, ApiError, errMsg } from '@/services/api';
import { countryName, currencyForCountry, img, money } from '@/utils/format';

const phone = z.string().trim().regex(/^\+\d{1,3}[\s-]?\d{6,14}$/, 'Include the country code, e.g. +977 98XXXXXXXX');
const addr = z.object({ country: z.string().length(2), region: z.string().trim().optional(), city: z.string().trim().min(1, 'City is required'), district: z.string().trim().optional(), street: z.string().trim().min(3, 'Street address is required'), building: z.string().trim().optional(), landmark: z.string().trim().optional(), postalCode: z.string().trim().optional(), instructions: z.string().trim().max(300).optional() });
const schema = z.object({
  firstName: z.string().trim().min(1, 'Required'), lastName: z.string().trim().min(1, 'Required'), email: z.string().trim().email('Enter a valid email'), phone,
  shipping: addr, giftOn: z.boolean(), recipientName: z.string().optional(), recipientPhone: z.string().optional(),
  billingSame: z.boolean(), billing: addr.optional(), paymentMethodKey: z.string().min(1, 'Choose a payment method'), customerNote: z.string().max(500).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Please accept the terms to place your order' }) }), marketingConsent: z.boolean(),
}).superRefine((v, ctx) => {
  const chk = (a: z.infer<typeof addr> | undefined, base: (string | number)[]) => {
    if (!a) return;
    if (a.country === 'NP' && !a.district) ctx.addIssue({ code: 'custom', path: [...base, 'district'], message: 'District is required for Nepal' });
    if (a.country === 'IN') { if (!a.region) ctx.addIssue({ code: 'custom', path: [...base, 'region'], message: 'State is required' }); if (!/^\d{6}$/.test(a.postalCode ?? '')) ctx.addIssue({ code: 'custom', path: [...base, 'postalCode'], message: 'Enter a 6-digit PIN code' }); }
    if (!['NP', 'IN'].includes(a.country) && !a.postalCode) ctx.addIssue({ code: 'custom', path: [...base, 'postalCode'], message: 'Postal code is required' });
  };
  chk(v.shipping, ['shipping']); if (!v.billingSame) chk(v.billing, ['billing']);
  if (v.giftOn) { if (!v.recipientName?.trim()) ctx.addIssue({ code: 'custom', path: ['recipientName'], message: 'Recipient name is required' }); if (v.recipientPhone && !phone.safeParse(v.recipientPhone).success) ctx.addIssue({ code: 'custom', path: ['recipientPhone'], message: 'Include the country code' }); }
});
type FormT = z.infer<typeof schema>;

function AddressFields({ prefix, countries, register, errors, watch }: { prefix: 'shipping' | 'billing'; countries: string[]; register: any; errors: any; watch: any }) {
  const country = watch(`${prefix}.country`);
  const e = errors?.[prefix] ?? {};
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Country"><Select {...register(`${prefix}.country`)}>{countries.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}</Select></Field>
      <Field label={country === 'IN' ? 'State' : 'Province / region'} error={e.region?.message}><Input {...register(`${prefix}.region`)} autoComplete="address-level1" /></Field>
      <Field label="City" error={e.city?.message}><Input {...register(`${prefix}.city`)} autoComplete="address-level2" /></Field>
      {country === 'NP' && <Field label="District" error={e.district?.message}><Input {...register(`${prefix}.district`)} /></Field>}
      <Field label="Street address" error={e.street?.message} className="sm:col-span-2"><Input {...register(`${prefix}.street`)} autoComplete="address-line1" /></Field>
      <Field label="House / building no." ><Input {...register(`${prefix}.building`)} /></Field>
      <Field label="Landmark / floor / apartment"><Input {...register(`${prefix}.landmark`)} /></Field>
      {country !== 'NP' && <Field label={country === 'IN' ? 'PIN code' : 'Postal code'} error={e.postalCode?.message}><Input {...register(`${prefix}.postalCode`)} autoComplete="postal-code" /></Field>}
      {prefix === 'shipping' && <Field label="Delivery instructions (optional)" className="sm:col-span-2"><Input {...register('shipping.instructions')} /></Field>}
    </div>
  );
}

export default function Checkout() {
  const cart = useCart();
  const { user } = useAuth();
  const { site } = useSite();
  const nav = useNavigate();
  const countries = site?.countries ?? ['NP'];
  const def = user?.addresses.find((a) => a.isDefault) ?? user?.addresses[0];
  const f = useForm<FormT>({
    resolver: zodResolver(schema), mode: 'onTouched',
    defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', email: user?.email ?? '', phone: user?.phone ?? '', shipping: { country: def?.country ?? countries[0] ?? 'NP', city: def?.city ?? 'Kathmandu', region: def?.region ?? '', district: def?.district ?? '', street: def?.street ?? '', building: def?.building ?? '', landmark: def?.landmark ?? '', postalCode: def?.postalCode ?? '' }, giftOn: false, billingSame: true, paymentMethodKey: '', acceptTerms: undefined as never, marketingConsent: false },
  });
  const { register, watch, handleSubmit, formState: { errors }, setValue } = f;
  const country = watch('shipping.country'), city = watch('shipping.city'), district = watch('shipping.district'), email = watch('email');
  const currency = currencyForCountry(country);
  const [dCity, setDCity] = useState(city);
  useEffect(() => { const t = setTimeout(() => setDCity(city), 500); return () => clearTimeout(t); }, [city]);
  const quoteQ = useQuote({ currency, country, city: dCity, district: district || undefined, email: email && /\S+@\S+\.\S+/.test(email) ? email : undefined });
  const quote = quoteQ.data;
  const err = quoteQ.error instanceof ApiError ? quoteQ.error : null;
  const methods = quote?.paymentMethods ?? [];
  const chosen = watch('paymentMethodKey');
  useEffect(() => { if (chosen && !methods.some((m) => m.key === chosen)) setValue('paymentMethodKey', ''); if (!chosen && methods.length === 1) setValue('paymentMethodKey', methods[0].key); }, [methods.map((m) => m.key).join(), chosen]);
  const idem = useRef<string>(sessionStorage.getItem('wk_idem') ?? '');
  const [serverErr, setServerErr] = useState('');
  const terms = useQuery({ queryKey: ['policies'], queryFn: () => api.get<{ items: { slug: string }[] }>('/policies') });
  const hasTerms = terms.data?.items.some((p) => p.slug === 'terms');

  const place = useMutation({
    mutationFn: (v: FormT) => {
      if (!idem.current) { idem.current = crypto.randomUUID(); sessionStorage.setItem('wk_idem', idem.current); }
      return api.post<{ orderNumber: string; trackingToken: string }>('/orders', {
        customer: { firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone }, recipient: v.giftOn ? { name: v.recipientName, phone: v.recipientPhone || undefined } : undefined,
        shippingAddress: v.shipping, billingSameAsShipping: v.billingSame, billingAddress: v.billingSame ? undefined : v.billing,
        items: cart.items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })), currency, couponCode: cart.coupon || undefined,
        paymentMethodKey: v.paymentMethodKey, customerNote: v.customerNote || undefined, acceptTerms: true, marketingConsent: v.marketingConsent,
      }, { 'Idempotency-Key': idem.current });
    },
    onSuccess: (r) => { sessionStorage.removeItem('wk_idem'); cart.clear(); nav(`/order/${r.orderNumber}?token=${encodeURIComponent(r.trackingToken)}&new=1`, { replace: true }); },
    onError: (e) => { setServerErr(errMsg(e)); if (e instanceof ApiError && e.status !== 0 && e.status !== 503) { idem.current = ''; sessionStorage.removeItem('wk_idem'); } },
  });

  if (cart.items.length === 0 && !place.isSuccess) return <Navigate to="/cart" replace />;
  const canPay = quote && quote.shipping && !err;

  return (
    <div className="container-x py-10">
      <Seo title="Checkout" noindex />
      <h1 className="text-4xl sm:text-5xl">Checkout</h1>
      {!user && <p className="mt-2 text-sm text-muted">Checking out as a guest. <Link to="/login" state={{ from: '/checkout' }} className="font-semibold text-brand underline">Sign in</Link> to use saved addresses.</p>}
      <form noValidate onSubmit={handleSubmit((v) => { setServerErr(''); place.mutate(v); })} className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-8">
          <section className="card space-y-4 p-6"><h2 className="text-2xl">Contact</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" error={errors.firstName?.message}><Input {...register('firstName')} autoComplete="given-name" /></Field>
              <Field label="Last name" error={errors.lastName?.message}><Input {...register('lastName')} autoComplete="family-name" /></Field>
              <Field label="Email" error={errors.email?.message}><Input type="email" {...register('email')} autoComplete="email" /></Field>
              <Field label="Mobile (with country code)" error={errors.phone?.message}><Input type="tel" placeholder="+977 98XXXXXXXX" {...register('phone')} autoComplete="tel" /></Field>
            </div></section>
          <section className="card space-y-4 p-6"><h2 className="text-2xl">Delivery address</h2>
            <AddressFields prefix="shipping" countries={countries} register={register} errors={errors} watch={watch} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" {...register('giftOn')} /> This is a gift / someone else will receive it</label>
            {watch('giftOn') && <div className="grid gap-4 sm:grid-cols-2"><Field label="Recipient name" error={errors.recipientName?.message}><Input {...register('recipientName')} /></Field><Field label="Recipient phone" error={errors.recipientPhone?.message}><Input placeholder="+977 …" {...register('recipientPhone')} /></Field></div>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" {...register('billingSame')} /> Billing address is the same as delivery</label>
            {!watch('billingSame') && <div className="border-t border-line pt-4"><h3 className="mb-3 font-sans text-sm font-bold">Billing address</h3><AddressFields prefix="billing" countries={countries} register={register} errors={errors} watch={watch} /></div>}
          </section>
          <section className="card space-y-4 p-6"><h2 className="text-2xl">Payment</h2>
            {quoteQ.isFetching && !quote ? <Spinner /> : methods.length === 0 ? <Alert tone="warn">{quote?.shippingError ?? 'No payment method is available for this address and currency yet. Please check your address or contact us.'}</Alert> : (
              <div role="radiogroup" aria-label="Payment method" className="grid gap-3">
                {methods.map((m) => <label key={m.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${chosen === m.key ? 'border-navy bg-navy/5' : 'border-line'}`}><input type="radio" value={m.key} className="mt-1" {...register('paymentMethodKey')} /><div><div className="font-semibold text-navy">{m.label}</div><p className="text-xs text-muted">{m.type === 'cod' ? 'Pay in cash when your order arrives.' : `Pay in ${m.currency} using the QR code on the next screen, then upload your screenshot. We verify every payment manually.`}</p></div></label>)}
              </div>)}
            {errors.paymentMethodKey && <p role="alert" className="text-xs font-medium text-red-600">{errors.paymentMethodKey.message}</p>}
            <p className="text-xs text-muted">Never share your OTP, password or PIN. We will only ask for a payment screenshot and transaction reference.</p>
            <Field label="Order note (optional)"><Textarea rows={2} {...register('customerNote')} /></Field>
          </section>
          <section className="card space-y-3 p-6">
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" {...register('acceptTerms')} /><span>I accept the <Link target="_blank" className="font-semibold text-brand underline" to="/policies/terms">Terms and Conditions</Link> and have read the <Link target="_blank" className="font-semibold text-brand underline" to="/policies/privacy">Privacy Policy</Link>.{!hasTerms && terms.isSuccess && <span className="text-muted"> (Policies are being finalised.)</span>}</span></label>
            {errors.acceptTerms && <p role="alert" className="text-xs font-medium text-red-600">{errors.acceptTerms.message}</p>}
            <label className="flex items-start gap-2 text-sm text-muted"><input type="checkbox" className="mt-1 h-4 w-4" {...register('marketingConsent')} /> Email me offers and news (optional)</label>
          </section>
        </div>
        <aside className="card h-fit space-y-4 p-6 lg:sticky lg:top-28" aria-label="Order summary">
          <h2 className="text-2xl">Order summary</h2>
          <ul className="max-h-64 space-y-3 overflow-y-auto pr-1">{(quote?.lines ?? []).map((l) => <li key={`${l.productId}-${l.variantId}`} className="flex gap-3 text-sm"><img src={img(l.image)} alt="" className="h-14 w-14 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="line-clamp-1 font-semibold">{l.name}</p><p className="text-xs text-muted">{l.variantLabel && `${l.variantLabel} · `}Qty {l.quantity}</p></div><span className="font-medium">{money(l.lineTotal, currency)}</span></li>)}</ul>
          {err && <Alert>{err.message}</Alert>}
          {quote?.couponError && <Alert tone="warn">{quote.couponError}</Alert>}
          {quote && <dl className="space-y-2 border-t border-line pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{money(quote.totals.subtotal, currency)}</dd></div>
            {quote.totals.discount > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount {quote.coupon && `(${quote.coupon.code})`}</dt><dd>−{money(quote.totals.discount, currency)}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted">Shipping{quote.shipping && ` · ${quote.shipping.methodName}`}</dt><dd>{quote.shipping ? (quote.shipping.isFree ? 'Free' : money(quote.totals.shipping, currency)) : '—'}</dd></div>
            {quote.shipping?.estimatedDays && <p className="text-xs text-muted">Estimated delivery: {quote.shipping.estimatedDays} after payment is verified.</p>}
            {quote.shippingError && <Alert tone="warn">{quote.shippingError}</Alert>}
            {quote.totals.tax > 0 && <div className="flex justify-between text-xs text-muted"><dt>Includes {site?.tax?.label ?? 'tax'}</dt><dd>{money(quote.totals.tax, currency)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-3 text-lg font-bold text-navy"><dt>Total ({currency})</dt><dd>{money(quote.totals.total, currency)}</dd></div>
          </dl>}
          {serverErr && <Alert>{serverErr}</Alert>}
          <Button type="submit" className="w-full py-3" loading={place.isPending} disabled={!canPay}>Place order</Button>
          <p className="text-center text-xs text-muted">Your order is confirmed only after we verify your payment.</p>
        </aside>
      </form>
    </div>
  );
}
