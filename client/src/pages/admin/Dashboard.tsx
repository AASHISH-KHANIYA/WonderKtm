import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Alert, Badge, Button, Field, Input, PageLoader, statusTone } from '@/components/ui';
import { PageHead, Stat, Table } from '@/components/admin/kit';
import { dateTime, label, money } from '@/utils/format';
import { useAuth } from '@/context/AuthContext';

const iso = (d: Date) => d.toISOString().slice(0, 10);
function Bars({ data, currency }: { data: { date: string; value: number; orders: number }[]; currency: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="py-8 text-center text-sm text-muted">No orders in this period.</p>;
  return (
    <div role="img" aria-label={`Daily order value in ${currency}`} className="flex h-44 items-end gap-1 overflow-x-auto pt-4">
      {data.map((d) => <div key={d.date} className="group relative flex min-w-[10px] flex-1 flex-col justify-end" title={`${d.date}: ${money(d.value, currency as any)} (${d.orders} orders)`}><div className="rounded-t bg-brand transition group-hover:bg-navy" style={{ height: `${Math.max(3, (d.value / max) * 100)}%` }} /></div>)}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86400_000))); const [to, setTo] = useState(iso(new Date()));
  const q = useQuery({ queryKey: ['admin', 'dashboard', from, to], queryFn: () => api.get<any>('/admin/dashboard', { from, to: `${to}T23:59:59` }) });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <Alert>Could not load the dashboard.</Alert>;
  const d = q.data;
  const inv = d.inventory;
  return (
    <div className="space-y-6">
      <PageHead title="Dashboard" sub={`Live figures from your database · ${from} to ${to}`}>
        <Field label="From" className="w-36"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To" className="w-36"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
      </PageHead>
      {d.payments?.awaitingVerification > 0 && <Alert tone="warn"><b>{d.payments.awaitingVerification} payment{d.payments.awaitingVerification === 1 ? '' : 's'}</b> waiting for verification. <Link to="/admin/payments" className="font-semibold underline">Review now</Link></Alert>}
      {d.orders && (<>
        <section aria-label="Orders" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Stat label="Total orders" value={d.orders.total} /><Stat label="Today" value={d.orders.today} /><Stat label="This week" value={d.orders.week} /><Stat label="This month" value={d.orders.month} />
          <Stat label="Pending" value={d.orders.pending} sub="in selected range" /><Stat label="Processing" value={d.orders.processing} />
          <Stat label="Shipped" value={d.orders.shipped} /><Stat label="Delivered" value={d.orders.delivered} tone="good" /><Stat label="Cancelled" value={d.orders.cancelled} />
          <Stat label="Payments awaiting" value={d.payments.awaitingVerification} tone={d.payments.awaitingVerification ? 'warn' : undefined} /><Stat label="Verified payments" value={d.payments.verified} tone="good" /><Stat label="Rejected payments" value={d.payments.rejected} />
        </section>
        {d.money.length === 0 && <Alert tone="info">No orders in this period yet.</Alert>}
        {d.money.map((m: any) => (
          <section key={m.currency} className="card space-y-4 p-5" aria-label={`${m.currency} sales`}>
            <div className="flex items-center justify-between"><h2 className="text-2xl">Sales in {m.currency}</h2><Badge>Currencies are never combined</Badge></div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              <Stat label="Verified receipts" value={money(m.verifiedReceipts, m.currency)} tone="good" sub="staff-verified payments" /><Stat label="Awaiting / unverified" value={money(m.unverifiedValue, m.currency)} sub="not yet counted as received" />
              <Stat label="Gross order value" value={money(m.gross, m.currency)} sub={`${m.orders} orders (excl. cancelled)`} /><Stat label="Refunds" value={money(m.refunds, m.currency)} /><Stat label="Net receipts" value={money(m.net, m.currency)} sub="after refunds & delivery fees" />
              <Stat label="Avg. order value" value={money(m.averageOrderValue, m.currency)} /><Stat label="Discounts given" value={money(m.discountsGiven, m.currency)} />
            </div>
            <Bars currency={m.currency} data={d.dailySeries.filter((s: any) => s.currency === m.currency)} />
          </section>))}
        <section className="grid gap-4 lg:grid-cols-2">
          <div><h2 className="mb-2 text-2xl">Best-selling products</h2><Table rows={d.topProducts} empty="No sales yet." cols={[{ head: 'Product', cell: (r: any) => r.name }, { head: 'Units', cell: (r: any) => r.quantity }, { head: 'Revenue', cell: (r: any) => money(r.revenue, r.currency) }]} /></div>
          <div><h2 className="mb-2 text-2xl">Top categories</h2><Table rows={d.topCategories} empty="No sales yet." cols={[{ head: 'Category', cell: (r: any) => r.name }, { head: 'Units', cell: (r: any) => r.quantity }, { head: 'Revenue', cell: (r: any) => money(r.revenue, r.currency) }]} /></div>
        </section>
        <section className="grid gap-3 md:grid-cols-4"><Stat label="Customers" value={d.customers.total} /><Stat label="New customers" value={d.customers.new} sub="in range" /><Stat label="Repeat customers" value={d.customers.repeat} /><Stat label="Coupons used" value={d.coupons.reduce((s: number, c: any) => s + c.uses, 0)} sub={d.coupons[0] ? `Top: ${d.coupons[0].code}` : 'in range'} /></section>
      </>)}
      <section className="grid grid-cols-3 gap-3"><Stat label="Active products" value={inv.activeProducts} /><Stat label="Low stock" value={inv.lowStock} tone={inv.lowStock ? 'warn' : undefined} /><Stat label="Out of stock" value={inv.outOfStock} tone={inv.outOfStock ? 'warn' : undefined} /></section>
      {d.recentOrders && <section><div className="mb-2 flex items-center justify-between"><h2 className="text-2xl">Recent orders</h2><Link to="/admin/orders" className="text-sm font-semibold text-brand hover:underline">All orders</Link></div>
        <Table rows={d.recentOrders} empty="No orders yet." cols={[{ head: 'Order', cell: (r: any) => <Link className="font-semibold text-brand hover:underline" to={`/admin/orders/${r._id}`}>{r.orderNumber}</Link> }, { head: 'When', cell: (r: any) => dateTime(r.placedAt) }, { head: 'Customer', cell: (r: any) => `${r.customer.firstName} ${r.customer.lastName}` }, { head: 'Total', cell: (r: any) => money(r.total, r.currency) }, { head: 'Payment', cell: (r: any) => <Badge tone={statusTone(r.paymentStatus)}>{label(r.paymentStatus)}</Badge> }, { head: 'Status', cell: (r: any) => <Badge tone={statusTone(r.fulfilmentStatus)}>{label(r.fulfilmentStatus)}</Badge> }]} /></section>}
      {user?.role === 'owner' && d.recentActivity?.length > 0 && <section><h2 className="mb-2 text-2xl">Recent activity</h2><Table rows={d.recentActivity} cols={[{ head: 'When', cell: (r: any) => dateTime(r.at) }, { head: 'Who', cell: (r: any) => r.actorEmail ?? 'system' }, { head: 'Action', cell: (r: any) => r.action }]} /></section>}
      <div className="flex gap-2"><a className="btn-outline btn-sm" href={`/api/admin/reports/sales.csv?from=${from}&to=${to}T23:59:59`}>Export sales summary (CSV)</a><Button variant="ghost" size="sm" onClick={() => q.refetch()}>Refresh</Button></div>
    </div>
  );
}
