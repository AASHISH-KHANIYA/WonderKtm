import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSite } from '@/context/SiteContext';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/hooks/useWishlist';
import { ProductCard, ProductGridSkeleton } from '@/components/ProductCard';
import { Seo } from '@/components/Seo';
import { Alert, Badge, Button, EmptyState, Field, Input, PageLoader, Pagination, Select, statusTone, useToast } from '@/components/ui';
import { api, errMsg } from '@/services/api';
import type { Address, Paged } from '@/types';
import { countryName, date, label, money } from '@/utils/format';

export function AccountLayout() {
  const { user, loading, logout, isStaff } = useAuth();
  const nav = useNavigate();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" state={{ from: '/account' }} replace />;
  const link = ({ isActive }: { isActive: boolean }) => `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-navy text-white' : 'text-navy hover:bg-navy/5'}`;
  return (
    <div className="container-x py-10"><Seo title="My account" noindex />
      <h1 className="text-4xl sm:text-5xl">Hello, {user.firstName}</h1>
      <div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Account">
          <NavLink end to="/account" className={link}>Profile</NavLink><NavLink to="/account/orders" className={link}>Orders</NavLink><NavLink to="/account/addresses" className={link}>Addresses</NavLink><NavLink to="/wishlist" className={link}>Wishlist</NavLink>
          {isStaff && <Link to="/admin" className="rounded-lg px-3 py-2 text-sm font-semibold text-brand hover:bg-navy/5">Admin panel</Link>}
          <button className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-muted hover:bg-navy/5" onClick={async () => { await logout(); nav('/'); }}>Sign out</button>
        </nav>
        <div><Outlet /></div>
      </div>
    </div>
  );
}

export function Profile() {
  const { user, refresh } = useAuth(); const toast = useToast(); const [err, setErr] = useState('');
  const f = useForm({ defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', phone: user?.phone ?? '', marketingConsent: user?.marketingConsent ?? false } });
  const pwf = useForm({ defaultValues: { currentPassword: '', newPassword: '' } });
  return (
    <div className="space-y-8">
      <section className="card space-y-4 p-6"><h2 className="text-2xl">Profile</h2>
        <p className="text-sm text-muted">{user?.email} {user?.emailVerified ? <Badge tone="good">Verified</Badge> : <Badge tone="warn">Not verified</Badge>}</p>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={f.handleSubmit(async (v) => { setErr(''); try { await api.patch('/auth/profile', { ...v, phone: v.phone || undefined }); await refresh(); toast('success', 'Profile saved.'); } catch (e) { setErr(errMsg(e)); } })}>
          <Field label="First name"><Input {...f.register('firstName')} /></Field><Field label="Last name"><Input {...f.register('lastName')} /></Field>
          <Field label="Phone (with country code)" className="sm:col-span-2"><Input placeholder="+977 …" {...f.register('phone')} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4" {...f.register('marketingConsent')} /> Email me offers and news</label>
          {err && <div className="sm:col-span-2"><Alert>{err}</Alert></div>}<div><Button type="submit" loading={f.formState.isSubmitting}>Save</Button></div>
        </form></section>
      <section className="card space-y-4 p-6"><h2 className="text-2xl">Change password</h2>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={pwf.handleSubmit(async (v) => { try { await api.post('/auth/change-password', v); pwf.reset(); toast('success', 'Password changed. Other devices were signed out.'); } catch (e) { toast('error', errMsg(e)); } })}>
          <Field label="Current password"><Input type="password" autoComplete="current-password" {...pwf.register('currentPassword')} /></Field><Field label="New password" hint="10+ characters, letters and numbers"><Input type="password" autoComplete="new-password" {...pwf.register('newPassword')} /></Field>
          <div><Button type="submit" variant="outline" loading={pwf.formState.isSubmitting}>Update password</Button></div></form></section>
    </div>
  );
}

export function Orders() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['my-orders', page], queryFn: () => api.get<Paged<any>>('/me/orders', { page }) });
  if (q.isLoading) return <PageLoader />;
  if (!q.data?.items.length) return <EmptyState title="No orders yet" text="When you place an order while signed in, it will appear here." action={<Link to="/shop" className="btn-primary">Start shopping</Link>} />;
  return (
    <div className="space-y-3">{q.data.items.map((o) => (
      <Link key={o._id} to={`/account/orders/${o._id}`} className="card block p-4 transition hover:border-navy/30">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold text-navy">{o.orderNumber}</div><div className="text-xs text-muted">{date(o.placedAt)} · {o.items?.length ?? 0} item(s)</div></div>
          <div className="flex items-center gap-2"><Badge tone={statusTone(o.paymentStatus)}>{label(o.paymentStatus)}</Badge><Badge tone={statusTone(o.fulfilmentStatus)}>{label(o.fulfilmentStatus)}</Badge><span className="font-semibold">{money(o.total, o.currency)}</span></div></div></Link>))}
      <Pagination page={q.data.page} pages={q.data.pages} onChange={setPage} /></div>
  );
}

export function Addresses() {
  const { user, refresh } = useAuth(); const { site } = useSite(); const toast = useToast(); const qc = useQueryClient();
  const [editing, setEditing] = useState<Address | null>(null);
  const f = useForm<Address>({ defaultValues: { country: 'NP' } });
  const save = useMutation({
    mutationFn: (v: Address) => (editing?._id ? api.put(`/auth/addresses/${editing._id}`, v) : api.post('/auth/addresses', v)),
    onSuccess: async () => { await refresh(); setEditing(null); f.reset({ country: 'NP' }); toast('success', 'Address saved.'); }, onError: (e) => toast('error', errMsg(e)),
  });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/auth/addresses/${id}`), onSuccess: async () => { await refresh(); qc.invalidateQueries({ queryKey: ['me'] }); } });
  const country = f.watch('country');
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">{(user?.addresses ?? []).map((a) => (
        <div key={a._id} className="card p-4 text-sm"><div className="flex items-start justify-between"><b>{a.label || 'Address'} {a.isDefault && <Badge tone="gold">Default</Badge>}</b>
          <div className="flex gap-1"><button className="text-xs font-semibold text-brand underline" onClick={() => { setEditing(a); f.reset(a); }}>Edit</button><button aria-label="Delete address" onClick={() => del.mutate(a._id!)} className="text-muted hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div></div>
          <p className="mt-2 leading-6 text-muted">{a.street}{a.building && `, ${a.building}`}<br />{[a.city, a.district, a.region].filter(Boolean).join(', ')}<br />{countryName(a.country)}</p></div>))}
        {!user?.addresses.length && <p className="text-sm text-muted">No saved addresses yet.</p>}</div>
      <form className="card grid gap-4 p-6 sm:grid-cols-2" onSubmit={f.handleSubmit((v) => save.mutate({ ...v, phone: v.phone || undefined }))}>
        <h2 className="text-2xl sm:col-span-2">{editing ? 'Edit address' : 'Add an address'}</h2>
        <Field label="Label"><Input placeholder="Home" {...f.register('label')} /></Field>
        <Field label="Country"><Select {...f.register('country')}>{(site?.countries ?? ['NP']).map((c) => <option key={c} value={c}>{countryName(c)}</option>)}</Select></Field>
        <Field label="City"><Input required {...f.register('city')} /></Field>
        {country === 'NP' ? <Field label="District"><Input required {...f.register('district')} /></Field> : <Field label="State / region"><Input {...f.register('region')} /></Field>}
        <Field label="Street address" className="sm:col-span-2"><Input required {...f.register('street')} /></Field>
        <Field label="Building / landmark"><Input {...f.register('building')} /></Field>{country !== 'NP' && <Field label="Postal code"><Input {...f.register('postalCode')} /></Field>}
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4" {...f.register('isDefault')} /> Make this my default address</label>
        <div className="flex gap-2 sm:col-span-2"><Button type="submit" loading={save.isPending}>Save address</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); f.reset({ country: 'NP' }); }}>Cancel</Button>}</div>
      </form>
    </div>
  );
}

export function Wishlist() {
  const w = useWishlist(); const { user, loading } = useAuth(); const cart = useCart(); const toast = useToast();
  if (loading) return <PageLoader />;
  if (!user) return <div className="container-x py-16"><Seo title="Wishlist" noindex /><EmptyState title="Sign in to see your wishlist" text="Save products you love and come back to them any time." action={<Link to="/login" state={{ from: '/wishlist' }} className="btn-primary">Sign in</Link>} /></div>;
  return (
    <div className="container-x py-10"><Seo title="Wishlist" noindex /><h1 className="text-4xl sm:text-5xl">Your wishlist</h1>
      <div className="mt-8">{w.loading ? <ProductGridSkeleton n={4} /> : w.items.length === 0 ? <EmptyState title="Nothing saved yet" action={<Link to="/shop" className="btn-primary">Browse products</Link>} /> : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">{w.items.map((p) => (
          <div key={p.id}><ProductCard p={p} />
            <Button size="sm" variant="outline" className="mt-3 w-full" disabled={!p.inStock} onClick={() => { if (p.variants.length) { location.assign(`/product/${p.slug}`); return; } cart.add({ productId: p.id, quantity: 1, name: p.name, slug: p.slug, image: p.images[0]?.url }); w.toggle(p.id); toast('success', 'Moved to your cart.'); }}>{p.variants.length ? 'Choose option' : 'Move to cart'}</Button></div>))}</div>)}</div></div>
  );
}
