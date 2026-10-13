import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Badge, Button, Field, Input, PageLoader, Pagination, Textarea, statusTone, useToast } from '@/components/ui';
import { PageHead, SectionCard, Table } from '@/components/admin/kit';
import { date, dateTime, label, money } from '@/utils/format';
import type { Paged } from '@/types';

export function CustomersList() {
  const nav = useNavigate(); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const r = useQuery({ queryKey: ['admin', 'customers', q, page], queryFn: () => api.get<Paged<any>>('/admin/customers', { q, page }), placeholderData: (p) => p });
  return (
    <div><PageHead title="Customers"><a className="btn-outline btn-sm" href="/api/admin/customers-export.csv">Export CSV</a></PageHead>
      <Field label="Search" className="mb-4 max-w-sm"><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, email or phone" /></Field>
      <Table loading={r.isLoading} rows={r.data?.items} onRow={(c: any) => nav(`/admin/customers/${c._id}`)} cols={[{ head: 'Name', cell: (c: any) => `${c.firstName} ${c.lastName}` }, { head: 'Email', cell: (c: any) => c.email }, { head: 'Phone', cell: (c: any) => c.phone || '—' }, { head: 'Orders / spent', cell: (c: any) => (c.stats.length ? c.stats.map((s: any) => `${s.orders} · ${money(s.spent, s.currency)}`).join(' | ') : '0') }, { head: 'Joined', cell: (c: any) => date(c.createdAt) }, { head: 'Status', cell: (c: any) => <Badge tone={statusTone(c.status)}>{c.status}</Badge> }]} />
      {r.data && <Pagination page={r.data.page} pages={r.data.pages} onChange={setPage} />}</div>
  );
}

export function CustomerDetail() {
  const { id } = useParams(); const qc = useQueryClient(); const toast = useToast(); const [note, setNote] = useState('');
  const q = useQuery({ queryKey: ['admin', 'customer', id], queryFn: () => api.get<any>(`/admin/customers/${id}`) });
  const re = () => qc.invalidateQueries({ queryKey: ['admin', 'customer', id] });
  const add = useMutation({ mutationFn: () => api.post(`/admin/customers/${id}/notes`, { text: note }), onSuccess: () => { setNote(''); re(); } });
  const st = useMutation({ mutationFn: (status: string) => api.patch(`/admin/customers/${id}/status`, { status }), onSuccess: () => { toast('success', 'Account status updated.'); re(); } });
  if (q.isLoading) return <PageLoader />;
  const c = q.data.customer;
  return (
    <div className="space-y-5"><PageHead title={`${c.firstName} ${c.lastName}`} sub={`${c.email} · ${c.phone ?? 'no phone'} · joined ${date(c.createdAt)}`}><Badge tone={statusTone(c.status)}>{c.status}</Badge>
      <Button variant="outline" size="sm" onClick={() => st.mutate(c.status === 'active' ? 'disabled' : 'active')}>{c.status === 'active' ? 'Disable account' : 'Enable account'}</Button></PageHead>
      <SectionCard title="Orders"><Table rows={q.data.orders} empty="No orders." cols={[{ head: 'Order', cell: (o: any) => <Link className="font-semibold text-brand hover:underline" to={`/admin/orders/${o._id}`}>{o.orderNumber}</Link> }, { head: 'Placed', cell: (o: any) => dateTime(o.placedAt) }, { head: 'Total', cell: (o: any) => money(o.total, o.currency) }, { head: 'Payment', cell: (o: any) => label(o.paymentStatus) }, { head: 'Status', cell: (o: any) => label(o.fulfilmentStatus) }]} /></SectionCard>
      <SectionCard title="Support notes" hint="Internal only. Never shown to the customer.">{(c.internalNotes ?? []).map((n: any, i: number) => <p key={i} className="rounded bg-cream p-2 text-xs"><b>{n.by?.firstName}</b> · {dateTime(n.at)}<br />{n.note}</p>)}<Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /><Button size="sm" disabled={!note.trim()} onClick={() => add.mutate()}>Add note</Button></SectionCard>
    </div>
  );
}
