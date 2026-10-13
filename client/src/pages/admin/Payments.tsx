import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errMsg } from '@/services/api';
import { Alert, Badge, Button, ConfirmDialog, Field, Input, Modal, Pagination, Select, Spinner, Textarea, statusTone, useToast } from '@/components/ui';
import { PageHead, Table } from '@/components/admin/kit';
import { dateTime, label, money } from '@/utils/format';
import type { Paged } from '@/types';

/** Evidence is fetched through an authenticated API route as a blob; the image never has a public URL. */
function Evidence({ attemptId, ev }: { attemptId: string; ev: { id: string; originalName: string } }) {
  const [src, setSrc] = useState(''); const [err, setErr] = useState(false);
  useEffect(() => { let url = ''; fetch(`/api/admin/payments/${attemptId}/evidence/${ev.id}`, { credentials: 'include' }).then((r) => (r.ok ? r.blob() : Promise.reject())).then((b) => { url = URL.createObjectURL(b); setSrc(url); }).catch(() => setErr(true)); return () => { if (url) URL.revokeObjectURL(url); }; }, [attemptId, ev.id]);
  if (err) return <Alert>Could not load this file.</Alert>;
  return src ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={`Payment evidence ${ev.originalName}`} className="max-h-[420px] w-full rounded-xl border border-line bg-white object-contain" /></a> : <div className="grid h-40 place-items-center"><Spinner /></div>;
}

export default function Payments() {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ status: '', method: '', currency: '', orderNumber: '', from: '', to: '', minAmount: '', maxAmount: '', page: 1 });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v, page: 1 }));
  const q = useQuery({ queryKey: ['admin', 'payments', f], queryFn: () => api.get<Paged<any>>('/admin/payments', { ...f, to: f.to ? `${f.to}T23:59:59` : '' }), refetchInterval: 30_000 });
  const [sel, setSel] = useState<any>(null); const [mode, setMode] = useState<'approve' | 'reject' | null>(null); const [funds, setFunds] = useState(false); const [reason, setReason] = useState('');
  const done = () => { setMode(null); setSel(null); setFunds(false); setReason(''); qc.invalidateQueries({ queryKey: ['admin'] }); };
  const review = useMutation({ mutationFn: (id: string) => api.post(`/admin/payments/${id}/review`), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payments'] }) });
  const approve = useMutation({ mutationFn: () => api.post(`/admin/payments/${sel._id}/approve`, { fundsConfirmed: funds }), onSuccess: () => { toast('success', 'Payment approved. The order is confirmed.'); done(); }, onError: (e) => { toast('error', errMsg(e)); done(); } });
  const reject = useMutation({ mutationFn: () => api.post(`/admin/payments/${sel._id}/reject`, { reason }), onSuccess: () => { toast('success', 'Payment rejected. The customer was notified.'); done(); }, onError: (e) => { toast('error', errMsg(e)); done(); } });
  const open = (r: any) => { setSel(r); if (r.status === 'submitted') review.mutate(r._id); };
  const decided = sel && !['submitted', 'under_review'].includes(sel.status);
  return (
    <div>
      <PageHead title="Payment verification" sub="A screenshot is not proof of payment. Approve only after you have confirmed the money in your eSewa / Khalti / bank account." />
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Status"><Select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">Awaiting review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All</option></Select></Field>
        <Field label="Method"><Select value={f.method} onChange={(e) => set('method', e.target.value)}><option value="">Any</option><option value="esewa">eSewa</option><option value="khalti">Khalti</option><option value="upi">UPI</option></Select></Field>
        <Field label="Currency"><Select value={f.currency} onChange={(e) => set('currency', e.target.value)}><option value="">Any</option><option>NPR</option><option>INR</option></Select></Field>
        <Field label="Order #"><Input value={f.orderNumber} onChange={(e) => set('orderNumber', e.target.value)} /></Field>
        <Field label="From"><Input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} /></Field><Field label="To"><Input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} /></Field>
        <Field label="Min amount"><Input inputMode="decimal" value={f.minAmount} onChange={(e) => set('minAmount', e.target.value)} /></Field><Field label="Max amount"><Input inputMode="decimal" value={f.maxAmount} onChange={(e) => set('maxAmount', e.target.value)} /></Field>
      </div>
      <Table loading={q.isLoading} rows={q.data?.items} empty="No payments waiting. 🎉" onRow={open} cols={[
        { head: 'Order', cell: (r: any) => <span className="font-semibold">{r.order?.orderNumber}</span> }, { head: 'Submitted', cell: (r: any) => dateTime(r.submittedAt) }, { head: 'Customer', cell: (r: any) => `${r.order?.customer?.firstName} ${r.order?.customer?.lastName}` },
        { head: 'Expected amount', cell: (r: any) => <b>{money(r.amount, r.currency)}</b> }, { head: 'Method', cell: (r: any) => r.order?.paymentMethodLabel }, { head: 'Txn ref', cell: (r: any) => r.transactionRef || '—' }, { head: 'Attempt', cell: (r: any) => r.attemptNo },
        { head: 'Status', cell: (r: any) => <Badge tone={statusTone(r.status)}>{label(r.status)}</Badge> }]} />
      {q.data && <Pagination page={q.data.page} pages={q.data.pages} onChange={(p) => setF((x) => ({ ...x, page: p }))} />}

      <Modal open={!!sel && !mode} onClose={() => setSel(null)} title={`Review payment · ${sel?.order?.orderNumber ?? ''}`} wide>
        {sel && <div className="grid gap-5 md:grid-cols-[1fr_300px]">
          <div className="space-y-3">{sel.evidence.length === 0 ? <Alert tone="warn">No evidence files.</Alert> : sel.evidence.map((e: any) => <Evidence key={e.id} attemptId={sel._id} ev={e} />)}</div>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl bg-navy p-4 text-white"><div className="text-xs uppercase text-white/70">Customer must have paid</div><div className="font-display text-3xl font-bold text-gold">{money(sel.amount, sel.currency)}</div></div>
            <dl className="space-y-1.5"><div className="flex justify-between"><dt className="text-muted">Currency</dt><dd className="font-semibold">{sel.currency}</dd></div><div className="flex justify-between"><dt className="text-muted">Method</dt><dd>{sel.order?.paymentMethodLabel}</dd></div><div className="flex justify-between gap-2"><dt className="text-muted">Pay-to account</dt><dd className="text-right">{sel.merchantInfo || 'Configured QR'}</dd></div><div className="flex justify-between gap-2"><dt className="text-muted">Transaction ref</dt><dd className="break-all text-right font-mono text-xs">{sel.transactionRef || '—'}</dd></div><div className="flex justify-between"><dt className="text-muted">Attempt</dt><dd>#{sel.attemptNo}</dd></div></dl>
            {sel.payerNote && <p className="rounded bg-cream p-2 text-xs">Customer note: {sel.payerNote}</p>}
            <Link to={`/admin/orders/${sel.order?._id}`} className="block text-xs font-semibold text-brand underline">Open full order</Link>
            {decided ? <Alert tone={sel.status === 'approved' ? 'success' : 'warn'}>Already {sel.status}{sel.decision?.reason && `: ${sel.decision.reason}`}{sel.decision?.by && ` · ${sel.decision.by.firstName}`}</Alert>
              : <div className="flex gap-2 pt-2"><Button className="flex-1" onClick={() => setMode('approve')}>Approve</Button><Button variant="outline" className="flex-1" onClick={() => setMode('reject')}>Reject</Button></div>}
          </div></div>}
      </Modal>
      <ConfirmDialog open={mode === 'approve'} title="Approve this payment?" confirmLabel="Approve payment" loading={approve.isPending} onClose={() => setMode(null)} onConfirm={() => approve.mutate()}>
        <p className="mb-3 text-sm">This confirms the order and commits stock. It cannot be undone from here.</p>
        <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={funds} onChange={(e) => setFunds(e.target.checked)} /><span>I have checked my account and confirm <b>{sel && money(sel.amount, sel.currency)}</b> has actually been received for order <b>{sel?.order?.orderNumber}</b>.</span></label>
        {!funds && <p className="mt-2 text-xs text-muted">Tick the box to enable approval.</p>}
      </ConfirmDialog>
      <Modal open={mode === 'reject'} onClose={() => setMode(null)} title="Reject this payment">
        <Field label="Reason (shown to the customer)" hint="Be specific so they can fix it, e.g. “Amount received was NPR 2,000, order total is NPR 2,500”."><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
        <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button variant="danger" disabled={reason.trim().length < 3} loading={reject.isPending} onClick={() => reject.mutate()}>Reject payment</Button></div>
      </Modal>
    </div>
  );
}
