import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errMsg } from '@/services/api';
import { Alert, Badge, Button, ConfirmDialog, Field, Input, PageLoader, Pagination, Select, Textarea, statusTone, useToast } from '@/components/ui';
import { PageHead, SectionCard, Table } from '@/components/admin/kit';
import { countryName, dateTime, label, money, img } from '@/utils/format';
import type { Paged } from '@/types';

const PAY = ['awaiting_evidence', 'unpaid', 'submitted', 'under_review', 'paid', 'rejected', 'refund_pending', 'partially_refunded', 'refunded'];
const FUL = ['awaiting_payment_verification', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancellation_requested', 'cancelled', 'return_requested', 'returned'];
const NEXT: Record<string, string[]> = { awaiting_payment_verification: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'], processing: ['packed', 'cancelled'], packed: ['shipped', 'cancelled'], shipped: ['out_for_delivery', 'delivered'], out_for_delivery: ['delivered'], delivered: ['return_requested'], cancellation_requested: ['cancelled', 'confirmed', 'processing'], return_requested: ['returned', 'delivered'], cancelled: [], returned: [] };

export function OrdersList() {
  const nav = useNavigate();
  const [f, setF] = useState({ q: '', paymentStatus: '', fulfilmentStatus: '', method: '', currency: '', from: '', to: '', page: 1 });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v, page: 1 }));
  const q = useQuery({ queryKey: ['admin', 'orders', f], queryFn: () => api.get<Paged<any>>('/admin/orders', { ...f, to: f.to ? `${f.to}T23:59:59` : '' }), placeholderData: (p) => p });
  return (
    <div>
      <PageHead title="Orders"><a className="btn-outline btn-sm" href={`/api/admin/orders/export.csv?${new URLSearchParams(Object.entries(f).filter(([k, v]) => v && k !== 'page') as any)}`}>Export CSV</a></PageHead>
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Search" className="lg:col-span-2"><Input placeholder="Order #, name, email, phone" value={f.q} onChange={(e) => set('q', e.target.value)} /></Field>
        <Field label="Payment"><Select value={f.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value)}><option value="">Any</option>{PAY.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
        <Field label="Fulfilment"><Select value={f.fulfilmentStatus} onChange={(e) => set('fulfilmentStatus', e.target.value)}><option value="">Any</option>{FUL.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
        <Field label="Currency"><Select value={f.currency} onChange={(e) => set('currency', e.target.value)}><option value="">Any</option><option>NPR</option><option>INR</option></Select></Field>
        <Field label="From"><Input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></Field>
      </div>
      <Table loading={q.isLoading} rows={q.data?.items} empty="No orders match these filters." onRow={(r: any) => nav(`/admin/orders/${r._id}`)} cols={[
        { head: 'Order', cell: (r: any) => <span className="font-semibold text-navy">{r.orderNumber}</span> }, { head: 'Placed', cell: (r: any) => dateTime(r.placedAt) },
        { head: 'Customer', cell: (r: any) => <div><div>{r.customer.firstName} {r.customer.lastName}</div><div className="text-xs text-muted">{r.customer.email} · {r.customer.phone}</div></div> },
        { head: 'Deliver to', cell: (r: any) => `${r.shippingAddress.city}, ${countryName(r.shippingAddress.country)}` }, { head: 'Total', cell: (r: any) => money(r.total, r.currency) }, { head: 'Method', cell: (r: any) => r.paymentMethodLabel ?? r.paymentMethodKey },
        { head: 'Payment', cell: (r: any) => <Badge tone={statusTone(r.paymentStatus)}>{label(r.paymentStatus)}</Badge> }, { head: 'Status', cell: (r: any) => <Badge tone={statusTone(r.fulfilmentStatus)}>{label(r.fulfilmentStatus)}</Badge> }]} />
      {q.data && <Pagination page={q.data.page} pages={q.data.pages} onChange={(p) => setF((x) => ({ ...x, page: p }))} />}
    </div>
  );
}

export function OrderDetail() {
  const { id } = useParams(); const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'order', id], queryFn: () => api.get<any>(`/admin/orders/${id}`) });
  const [to, setTo] = useState(''); const [note, setNote] = useState(''); const [carrier, setCarrier] = useState(''); const [track, setTrack] = useState(''); const [restock, setRestock] = useState(true);
  const [confirm, setConfirm] = useState(false); const [nt, setNt] = useState(''); const [refund, setRefund] = useState({ action: 'request', amount: '' });
  const reload = () => { qc.invalidateQueries({ queryKey: ['admin', 'order', id] }); qc.invalidateQueries({ queryKey: ['admin', 'orders'] }); };
  const move = useMutation({ mutationFn: () => api.patch(`/admin/orders/${id}/status`, { status: to, note: note || undefined, carrier: carrier || undefined, trackingNumber: track || undefined, restock }), onSuccess: () => { toast('success', 'Status updated.'); setTo(''); setNote(''); setConfirm(false); reload(); }, onError: (e) => { toast('error', errMsg(e)); setConfirm(false); } });
  const addNote = useMutation({ mutationFn: () => api.post(`/admin/orders/${id}/notes`, { text: nt }), onSuccess: () => { setNt(''); reload(); } });
  const cod = useMutation({ mutationFn: () => api.post(`/admin/orders/${id}/cod-collected`), onSuccess: () => { toast('success', 'Marked as paid.'); reload(); }, onError: (e) => toast('error', errMsg(e)) });
  const rf = useMutation({ mutationFn: () => api.post(`/admin/orders/${id}/refund`, { action: refund.action, amount: refund.amount ? Number(refund.amount) : undefined }), onSuccess: () => { toast('success', 'Refund status updated.'); reload(); }, onError: (e) => toast('error', errMsg(e)) });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <Alert>Order not found.</Alert>;
  const { order: o, payments, history, audit } = q.data;
  const options = NEXT[o.fulfilmentStatus] ?? [];
  const isCod = o.paymentMethodKey === 'cod';
  return (
    <div className="space-y-5">
      <PageHead title={`Order ${o.orderNumber}`} sub={`Placed ${dateTime(o.placedAt)}`}><Badge tone={statusTone(o.paymentStatus)}>Payment: {label(o.paymentStatus)}</Badge><Badge tone={statusTone(o.fulfilmentStatus)}>{label(o.fulfilmentStatus)}</Badge></PageHead>
      {o.paymentStatus !== 'paid' && !isCod && !['cancelled', 'returned'].includes(o.fulfilmentStatus) && <Alert tone="warn">Payment has <b>not</b> been verified. Fulfilment is blocked until a payment is approved in <Link to="/admin/payments" className="underline">Payment verification</Link>.</Alert>}
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <SectionCard title="Items"><ul className="divide-y divide-line">{o.items.map((i: any, k: number) => <li key={k} className="flex gap-3 py-3 text-sm"><img src={img(i.image)} alt="" className="h-12 w-12 rounded object-cover" /><div className="flex-1"><p className="font-semibold">{i.name}</p><p className="text-xs text-muted">{i.variantLabel && `${i.variantLabel} · `}SKU {i.sku} · {money(i.unitPrice, o.currency)} × {i.quantity}</p></div><span className="font-medium">{money(i.lineTotal, o.currency)}</span></li>)}</ul>
            <dl className="space-y-1 border-t border-line pt-3 text-sm"><div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{money(o.subtotal, o.currency)}</dd></div>{o.discountTotal > 0 && <div className="flex justify-between"><dt className="text-muted">Discount {o.coupon?.code && `(${o.coupon.code})`}</dt><dd>−{money(o.discountTotal, o.currency)}</dd></div>}<div className="flex justify-between"><dt className="text-muted">Shipping ({o.shipping?.zoneName})</dt><dd>{money(o.shippingTotal, o.currency)}</dd></div>{o.taxTotal > 0 && <div className="flex justify-between"><dt className="text-muted">Tax included</dt><dd>{money(o.taxTotal, o.currency)}</dd></div>}<div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{money(o.total, o.currency)}</dd></div>{o.refundedAmount > 0 && <div className="flex justify-between text-red-700"><dt>Refunded</dt><dd>{money(o.refundedAmount, o.currency)}</dd></div>}</dl></SectionCard>
          <SectionCard title="Payment" hint={`Method: ${o.paymentMethodLabel}`}>
            {payments.length === 0 ? <p className="text-sm text-muted">{isCod ? 'Cash on delivery — no evidence expected.' : 'No payment attempts yet.'}</p> : payments.map((p: any) => (
              <div key={p._id} className="rounded-xl border border-line p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><b>Attempt {p.attemptNo}</b><Badge tone={statusTone(p.status)}>{label(p.status)}</Badge></div>
                <p className="mt-1 text-muted">Expected {money(p.amount, p.currency)} · Ref: {p.transactionRef || '—'} · {p.evidence.length} file(s){p.decision?.reason && <> · Reason: {p.decision.reason}</>}{p.decision?.by && <> · by {p.decision.by.firstName} {dateTime(p.decision.at)}</>}</p></div>))}
            {['submitted', 'under_review'].includes(o.paymentStatus) && <Link to="/admin/payments" className="btn-accent btn-sm">Open verification queue</Link>}
            {isCod && o.paymentStatus === 'unpaid' && <Button size="sm" variant="outline" loading={cod.isPending} onClick={() => cod.mutate()}>Mark cash as collected</Button>}
            {['paid', 'refund_pending', 'partially_refunded'].includes(o.paymentStatus) && (
              <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3"><Field label="Refund" className="w-44"><Select value={refund.action} onChange={(e) => setRefund({ ...refund, action: e.target.value })}><option value="request">Mark refund pending</option><option value="partial">Record partial refund</option><option value="full">Record full refund</option></Select></Field>{refund.action === 'partial' && <Field label="Amount" className="w-32"><Input inputMode="decimal" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} /></Field>}<Button size="sm" variant="outline" loading={rf.isPending} onClick={() => rf.mutate()}>Apply</Button><p className="basis-full text-xs text-muted">This records the refund status only. Send the money back through eSewa/Khalti/UPI yourself.</p></div>)}
          </SectionCard>
          <SectionCard title="Status history"><ol className="space-y-2 text-sm">{history.map((h: any) => <li key={h._id} className="flex justify-between gap-3"><span><Badge>{h.kind}</Badge> {label(h.to)}{h.note && <span className="text-muted"> — {h.note}</span>}<span className="text-xs text-muted"> · {h.by ? `${h.by.firstName} (staff)` : h.actorType}</span></span><time className="shrink-0 text-xs text-muted">{dateTime(h.at)}</time></li>)}</ol></SectionCard>
          {audit.length > 0 && <SectionCard title="Admin audit trail"><ul className="space-y-1 text-xs text-muted">{audit.map((a: any) => <li key={a._id}>{dateTime(a.at)} · {a.actorEmail} · {a.action}</li>)}</ul></SectionCard>}
        </div>
        <div className="space-y-5">
          <SectionCard title="Update status">
            {options.length === 0 ? <p className="text-sm text-muted">This order is in a final state.</p> : <>
              <Field label="Move to"><Select value={to} onChange={(e) => setTo(e.target.value)}><option value="">Select…</option>{options.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
              {to === 'shipped' && <><Field label="Carrier"><Input value={carrier} onChange={(e) => setCarrier(e.target.value)} /></Field><Field label="Tracking number"><Input value={track} onChange={(e) => setTrack(e.target.value)} /></Field></>}
              {to === 'returned' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Put items back in stock</label>}
              <Field label={to === 'cancelled' ? 'Cancellation reason' : 'Note (optional)'}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <Button className="w-full" disabled={!to} onClick={() => (to === 'cancelled' ? setConfirm(true) : move.mutate())} loading={move.isPending}>Update</Button></>}
          </SectionCard>
          <SectionCard title="Customer"><div className="space-y-1 text-sm"><p className="font-semibold">{o.customer.firstName} {o.customer.lastName}</p><p><a className="text-brand underline" href={`mailto:${o.customer.email}`}>{o.customer.email}</a></p><p>{o.customer.phone}</p>{o.recipient?.name && <p className="text-muted">Gift for: {o.recipient.name} {o.recipient.phone}</p>}{o.customerNote && <p className="rounded bg-cream p-2 text-xs">“{o.customerNote}”</p>}</div></SectionCard>
          <SectionCard title="Delivery address"><p className="text-sm leading-6">{o.shippingAddress.street}{o.shippingAddress.building && `, ${o.shippingAddress.building}`}{o.shippingAddress.landmark && ` (${o.shippingAddress.landmark})`}<br />{[o.shippingAddress.city, o.shippingAddress.district, o.shippingAddress.region, o.shippingAddress.postalCode].filter(Boolean).join(', ')}<br />{countryName(o.shippingAddress.country)}</p>{o.shippingAddress.instructions && <p className="text-xs text-muted">Instructions: {o.shippingAddress.instructions}</p>}<p className="text-xs text-muted">{o.shipping?.methodName} · {o.shipping?.estimatedDays}</p></SectionCard>
          <SectionCard title="Internal notes">{o.notes.map((n: any, i: number) => <p key={i} className="rounded bg-cream p-2 text-xs"><b>{n.by?.firstName}</b> · {dateTime(n.at)}<br />{n.text}</p>)}<Textarea rows={2} value={nt} onChange={(e) => setNt(e.target.value)} placeholder="Visible to staff only" /><Button size="sm" variant="outline" disabled={!nt.trim()} onClick={() => addNote.mutate()}>Add note</Button></SectionCard>
        </div>
      </div>
      <ConfirmDialog open={confirm} danger title="Cancel this order?" message="Stock and any coupon use will be released. The customer is emailed." confirmLabel="Cancel order" loading={move.isPending} onClose={() => setConfirm(false)} onConfirm={() => move.mutate()} />
    </div>
  );
}
