import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { OrderView, type OrderData } from '@/components/OrderView';
import { Seo } from '@/components/Seo';
import { Alert, Button, Field, Input, PageLoader } from '@/components/ui';

/** Guest / link-based order page. The unguessable token in the URL is the credential. */
export function GuestOrder() {
  const { orderNumber } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get('token') ?? '';
  const qc = useQueryClient();
  const key = ['guest-order', orderNumber, token];
  const q = useQuery({ queryKey: key, queryFn: () => api.post<{ order: OrderData }>('/orders/track', { orderNumber, token }), retry: false, refetchInterval: (s) => (s.state.data?.order.paymentStatus === 'submitted' ? 20_000 : false) });
  const up = async (file: File, ref: string) => { const f = new FormData(); f.set('orderNumber', orderNumber!); f.set('token', token); if (ref) f.set('transactionRef', ref); f.set('file', file); const r = await api.upload<{ order: OrderData }>('/orders/track/evidence', f); qc.setQueryData(key, r); };
  const cancel = async () => { const r = await api.post<{ order: OrderData }>('/orders/track/cancel', { orderNumber, token }); qc.setQueryData(key, r); };
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <div className="container-x max-w-xl py-20 text-center"><Seo title="Order not found" noindex /><h1 className="text-4xl">We couldn’t find that order</h1><p className="mt-2 text-muted">The link may be incomplete. Use the full link from your confirmation, or try the tracking form.</p><Link to="/track" className="btn-primary mt-6">Track an order</Link></div>;
  return <div className="container-x max-w-4xl py-10"><Seo title={`Order ${orderNumber}`} noindex /><OrderView order={q.data!.order} onUpload={up} onCancel={cancel} isNew={sp.get('new') === '1'} />
    <p className="mt-8 text-center text-sm text-muted">Want to see all your orders in one place? <Link to="/register" className="font-semibold text-brand underline">Create an account</Link> with the same email.</p></div>;
}

export function TrackForm() {
  const nav = useNavigate();
  const [n, setN] = useState(''); const [t, setT] = useState('');
  return (
    <div className="container-x max-w-lg py-16"><Seo title="Track your order" noindex />
      <h1 className="text-4xl sm:text-5xl">Track your order</h1><p className="mt-2 text-sm text-muted">Enter your order number and the tracking code from your confirmation email, or just open the link we sent you.</p>
      <form className="card mt-6 space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); nav(`/order/${encodeURIComponent(n.trim())}?token=${encodeURIComponent(t.trim())}`); }}>
        <Field label="Order number"><Input required value={n} onChange={(e) => setN(e.target.value)} placeholder="WK-001001" /></Field>
        <Field label="Tracking code"><Input required value={t} onChange={(e) => setT(e.target.value)} /></Field>
        <Button type="submit" className="w-full">Track order</Button>
        <p className="text-center text-xs text-muted">Signed in? <Link to="/account/orders" className="font-semibold text-brand underline">See your orders</Link></p>
      </form>
    </div>
  );
}

export function AccountOrder() {
  const { id } = useParams();
  const qc = useQueryClient();
  const key = ['my-order', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ order: OrderData }>(`/me/orders/${id}`), retry: false });
  const up = async (file: File, ref: string) => { const f = new FormData(); if (ref) f.set('transactionRef', ref); f.set('file', file); qc.setQueryData(key, await api.upload(`/me/orders/${id}/evidence`, f)); };
  const cancel = useMutation({ mutationFn: () => api.post<{ order: OrderData }>(`/me/orders/${id}/cancel`), onSuccess: (r) => qc.setQueryData(key, r) });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <Alert>We couldn’t find that order in your account.</Alert>;
  return <OrderView order={q.data!.order} onUpload={up} onCancel={() => cancel.mutateAsync()} />;
}
