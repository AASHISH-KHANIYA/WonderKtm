import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, errMsg } from '@/services/api';
import { Alert, Badge, Button, Field, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { PageHead, Table, Toggle } from '@/components/admin/kit';
import { date, money } from '@/utils/format';

const dtl = (d?: string) => (d ? new Date(d).toISOString().slice(0, 16) : '');
const n = (s: any) => (s === '' || s == null ? null : Number(s));

export function CouponsAdmin() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'coupons'], queryFn: () => api.get<{ items: any[] }>('/admin/coupons') });
  const cats = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api.get<{ items: any[] }>('/admin/categories') });
  const [e, setE] = useState<any>(null); const [err, setErr] = useState('');
  const save = useMutation({
    mutationFn: (c: any) => { const body = { code: c.code, description: c.description, type: c.type, value: Number(c.value || 0), currency: c.currency, minOrder: n(c.minOrder), maxDiscount: n(c.maxDiscount), startsAt: c.startsAt ? new Date(c.startsAt).toISOString() : null, endsAt: c.endsAt ? new Date(c.endsAt).toISOString() : null, usageLimit: n(c.usageLimit), perCustomerLimit: n(c.perCustomerLimit), firstOrderOnly: !!c.firstOrderOnly, categoryIds: c.categoryIds ?? [], productIds: [], active: c.active !== false }; return c._id ? api.put(`/admin/coupons/${c._id}`, body) : api.post('/admin/coupons', body); },
    onSuccess: () => { setE(null); toast('success', 'Coupon saved.'); qc.invalidateQueries({ queryKey: ['admin', 'coupons'] }); }, onError: (x) => setErr(errMsg(x)),
  });
  const rm = useMutation({ mutationFn: (id: string) => api.del(`/admin/coupons/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'coupons'] }) });
  return (
    <div><PageHead title="Discounts & coupons" sub="Validated on the server at checkout. Scheduled sales are set per product."><Button size="sm" onClick={() => { setErr(''); setE({ code: '', type: 'percentage', value: 10, currency: 'NPR', active: true }); }}><Plus className="h-4 w-4" />New coupon</Button></PageHead>
      <Table loading={q.isLoading} rows={q.data?.items} empty="No coupons yet." onRow={(c: any) => { setErr(''); setE({ ...c, startsAt: dtl(c.startsAt), endsAt: dtl(c.endsAt), minOrder: c.minOrder ?? '', maxDiscount: c.maxDiscount ?? '', usageLimit: c.usageLimit ?? '', perCustomerLimit: c.perCustomerLimit ?? '' }); }} cols={[
        { head: 'Code', cell: (c: any) => <b className="font-mono">{c.code}</b> }, { head: 'Discount', cell: (c: any) => (c.type === 'percentage' ? `${c.value}%` : c.type === 'fixed' ? money(c.value, c.currency) : 'Free shipping') }, { head: 'Min order', cell: (c: any) => (c.minOrder ? money(c.minOrder, c.currency) : '—') },
        { head: 'Valid', cell: (c: any) => (c.startsAt || c.endsAt ? `${date(c.startsAt)} – ${date(c.endsAt)}` : 'Always') }, { head: 'Used', cell: (c: any) => `${c.performance?.uses ?? 0}${c.usageLimit ? ` / ${c.usageLimit}` : ''}` }, { head: 'Given', cell: (c: any) => money(c.performance?.discountGiven ?? 0, c.currency) }, { head: 'Status', cell: (c: any) => (c.active ? <Badge tone="good">Active</Badge> : <Badge>Off</Badge>) },
        { head: '', cell: (c: any) => <button aria-label={`Delete ${c.code}`} className="text-red-600" onClick={(ev) => { ev.stopPropagation(); rm.mutate(c._id); }}><Trash2 className="h-4 w-4" /></button> }]} />
      <Modal open={!!e} onClose={() => setE(null)} title={e?._id ? 'Edit coupon' : 'New coupon'} wide>
        {e && <div className="space-y-4">{err && <Alert>{err}</Alert>}
          <div className="grid gap-4 sm:grid-cols-3"><Field label="Code"><Input value={e.code} onChange={(x) => setE({ ...e, code: x.target.value.toUpperCase() })} /></Field><Field label="Type"><Select value={e.type} onChange={(x) => setE({ ...e, type: x.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option><option value="free_shipping">Free shipping</option></Select></Field>
            {e.type !== 'free_shipping' && <Field label={e.type === 'percentage' ? 'Percent off' : 'Amount off'}><Input inputMode="decimal" value={e.value} onChange={(x) => setE({ ...e, value: x.target.value })} /></Field>}
            <Field label="Currency (fixed / min / max)"><Select value={e.currency} onChange={(x) => setE({ ...e, currency: x.target.value })}><option>NPR</option><option>INR</option></Select></Field><Field label="Minimum order"><Input inputMode="decimal" value={e.minOrder ?? ''} onChange={(x) => setE({ ...e, minOrder: x.target.value })} /></Field><Field label="Max discount"><Input inputMode="decimal" value={e.maxDiscount ?? ''} onChange={(x) => setE({ ...e, maxDiscount: x.target.value })} /></Field>
            <Field label="Starts"><Input type="datetime-local" value={e.startsAt ?? ''} onChange={(x) => setE({ ...e, startsAt: x.target.value })} /></Field><Field label="Ends"><Input type="datetime-local" value={e.endsAt ?? ''} onChange={(x) => setE({ ...e, endsAt: x.target.value })} /></Field><Field label="Total usage limit"><Input inputMode="numeric" value={e.usageLimit ?? ''} onChange={(x) => setE({ ...e, usageLimit: x.target.value })} /></Field>
            <Field label="Per-customer limit"><Input inputMode="numeric" value={e.perCustomerLimit ?? ''} onChange={(x) => setE({ ...e, perCustomerLimit: x.target.value })} /></Field>
            <Field label="Only these categories (optional)" className="sm:col-span-2"><select multiple className="input h-24" value={e.categoryIds ?? []} onChange={(x) => setE({ ...e, categoryIds: Array.from(x.target.selectedOptions).map((o) => o.value) })}>{cats.data?.items.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field></div>
          <div className="flex gap-6"><Toggle label="First order only" checked={!!e.firstOrderOnly} onChange={(v) => setE({ ...e, firstOrderOnly: v })} /><Toggle label="Active" checked={e.active !== false} onChange={(v) => setE({ ...e, active: v })} /></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setE(null)}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate(e)}>Save coupon</Button></div></div>}
      </Modal>
    </div>
  );
}

export function ShippingAdmin() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'zones'], queryFn: () => api.get<{ items: any[] }>('/admin/shipping-zones') });
  const [e, setE] = useState<any>(null); const [err, setErr] = useState('');
  const save = useMutation({ mutationFn: (z: any) => { const body = { name: z.name, key: z.key || undefined, country: z.country, currency: z.currency, cities: String(z.cities ?? '').split(',').map((s: string) => s.trim()).filter(Boolean), districts: String(z.districts ?? '').split(',').map((s: string) => s.trim()).filter(Boolean), freeShippingAll: !!z.freeShippingAll, active: z.active !== false, sortOrder: Number(z.sortOrder || 0), methods: z.methods.map((m: any) => ({ _id: m._id, name: m.name, charge: Number(m.charge || 0), freeThreshold: n(m.freeThreshold), estimatedDays: m.estimatedDays, codAllowed: !!m.codAllowed })) }; return z._id ? api.put(`/admin/shipping-zones/${z._id}`, body) : api.post('/admin/shipping-zones', body); }, onSuccess: () => { setE(null); toast('success', 'Zone saved.'); qc.invalidateQueries({ queryKey: ['admin', 'zones'] }); }, onError: (x) => setErr(errMsg(x)) });
  const rm = useMutation({ mutationFn: (id: string) => api.del(`/admin/shipping-zones/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'zones'] }) });
  return (
    <div><PageHead title="Shipping zones" sub="We only deliver to locations covered by an active zone. Charges are calculated on the server."><Button size="sm" onClick={() => { setErr(''); setE({ name: '', country: 'NP', currency: 'NPR', cities: '', districts: '', active: true, methods: [{ name: 'Standard delivery', charge: 0, estimatedDays: '2–3 days' }] }); }}><Plus className="h-4 w-4" />Add zone</Button></PageHead>
      <Table loading={q.isLoading} rows={q.data?.items} onRow={(z: any) => { setErr(''); setE({ ...z, cities: z.cities.join(', '), districts: z.districts.join(', ') }); }} cols={[{ head: 'Zone', cell: (z: any) => <b>{z.name}</b> }, { head: 'Country', cell: (z: any) => `${z.country} · ${z.currency}` }, { head: 'Covers', cell: (z: any) => (z.cities.length ? z.cities.join(', ') : 'Whole country (fallback)') }, { head: 'Methods', cell: (z: any) => z.methods.map((m: any) => `${m.name}: ${z.freeShippingAll || m.charge === 0 ? 'Free' : money(m.charge, z.currency)}${m.estimatedDays ? ` (${m.estimatedDays})` : ''}`).join(' | ') }, { head: 'Status', cell: (z: any) => (z.active ? <Badge tone="good">Active</Badge> : <Badge>Off</Badge>) }, { head: '', cell: (z: any) => <button aria-label={`Delete ${z.name}`} className="text-red-600" onClick={(ev) => { ev.stopPropagation(); rm.mutate(z._id); }}><Trash2 className="h-4 w-4" /></button> }]} />
      <Modal open={!!e} onClose={() => setE(null)} title={e?._id ? 'Edit zone' : 'New zone'} wide>
        {e && <div className="space-y-4">{err && <Alert>{err}</Alert>}
          <div className="grid gap-4 sm:grid-cols-3"><Field label="Name"><Input value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })} /></Field><Field label="Country code"><Input maxLength={2} value={e.country} onChange={(x) => setE({ ...e, country: x.target.value.toUpperCase() })} /></Field><Field label="Currency"><Select value={e.currency} onChange={(x) => setE({ ...e, currency: x.target.value })}><option>NPR</option><option>INR</option></Select></Field>
            <Field label="Cities (comma separated)" hint="Leave empty for a whole-country fallback zone." className="sm:col-span-2"><Input value={e.cities} onChange={(x) => setE({ ...e, cities: x.target.value })} /></Field><Field label="Districts (optional)"><Input value={e.districts} onChange={(x) => setE({ ...e, districts: x.target.value })} /></Field></div>
          <div className="flex gap-6"><Toggle label="Free shipping for this whole zone" checked={!!e.freeShippingAll} onChange={(v) => setE({ ...e, freeShippingAll: v })} /><Toggle label="Active" checked={e.active !== false} onChange={(v) => setE({ ...e, active: v })} /></div>
          {e.methods.map((m: any, i: number) => <div key={i} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-5"><Field label="Method"><Input value={m.name} onChange={(x) => setE({ ...e, methods: e.methods.map((y: any, k: number) => (k === i ? { ...y, name: x.target.value } : y)) })} /></Field><Field label="Charge"><Input inputMode="decimal" value={m.charge} onChange={(x) => setE({ ...e, methods: e.methods.map((y: any, k: number) => (k === i ? { ...y, charge: x.target.value } : y)) })} /></Field><Field label="Free above"><Input inputMode="decimal" value={m.freeThreshold ?? ''} onChange={(x) => setE({ ...e, methods: e.methods.map((y: any, k: number) => (k === i ? { ...y, freeThreshold: x.target.value } : y)) })} /></Field><Field label="Estimated time"><Input value={m.estimatedDays ?? ''} onChange={(x) => setE({ ...e, methods: e.methods.map((y: any, k: number) => (k === i ? { ...y, estimatedDays: x.target.value } : y)) })} /></Field><div className="flex items-end justify-between"><Toggle label="COD ok" checked={!!m.codAllowed} onChange={(v) => setE({ ...e, methods: e.methods.map((y: any, k: number) => (k === i ? { ...y, codAllowed: v } : y)) })} /><button aria-label="Remove method" className="text-red-600" onClick={() => setE({ ...e, methods: e.methods.filter((_: any, k: number) => k !== i) })}><Trash2 className="h-4 w-4" /></button></div></div>)}
          <Button variant="outline" size="sm" onClick={() => setE({ ...e, methods: [...e.methods, { name: '', charge: 0 }] })}><Plus className="h-4 w-4" />Add method</Button>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setE(null)}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate(e)}>Save zone</Button></div></div>}
      </Modal>
    </div>
  );
}
