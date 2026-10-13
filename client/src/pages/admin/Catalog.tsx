import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { api, errMsg } from '@/services/api';
import { Alert, Badge, Button, ConfirmDialog, Field, Input, Modal, Pagination, Select, Textarea, useToast } from '@/components/ui';
import { ImageUploader, PageHead, Table, Toggle } from '@/components/admin/kit';
import { dateTime } from '@/utils/format';
import type { Img, Paged } from '@/types';

export function CategoriesAdmin() {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api.get<{ items: any[] }>('/admin/categories') });
  const [edit, setEdit] = useState<any>(null); const [del, setDel] = useState<any>(null); const [err, setErr] = useState('');
  const re = () => qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
  const save = useMutation({ mutationFn: (c: any) => { const body = { name: c.name, slug: c.slug || undefined, parent: c.parent || null, description: c.description, image: c.image ?? null, banner: c.banner ?? null, isActive: c.isActive !== false, showOnHome: !!c.showOnHome, seo: { title: c.seoTitle, description: c.seoDescription } }; return c._id ? api.put(`/admin/categories/${c._id}`, body) : api.post('/admin/categories', body); }, onSuccess: () => { setEdit(null); setErr(''); toast('success', 'Category saved.'); re(); }, onError: (e) => setErr(errMsg(e)) });
  const rm = useMutation({ mutationFn: (id: string) => api.del<any>(`/admin/categories/${id}`), onSuccess: (r) => { toast('success', r.message ?? 'Category deleted.'); setDel(null); re(); } });
  const reorder = useMutation({ mutationFn: (ids: string[]) => api.post('/admin/categories/reorder', { ids }), onSuccess: re });
  const items = q.data?.items ?? [];
  const move = (i: number, d: number) => { const ids = items.map((c) => c._id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; reorder.mutate(ids); };
  return (
    <div><PageHead title="Categories" sub="Create categories and subcategories. A category with products is archived, never deleted."><Button size="sm" onClick={() => { setErr(''); setEdit({ name: '', isActive: true }); }}><Plus className="h-4 w-4" />Add category</Button></PageHead>
      <Table loading={q.isLoading} rows={items} cols={[
        { head: 'Name', cell: (c: any) => <span className={c.parent ? 'pl-5 text-ink' : 'font-semibold text-navy'}>{c.parent ? '↳ ' : ''}{c.name}</span> }, { head: 'Slug', cell: (c: any) => c.slug }, { head: 'Products', cell: (c: any) => c.productCount },
        { head: 'Visibility', cell: (c: any) => (c.archivedAt ? <Badge tone="bad">Archived</Badge> : c.isActive ? <Badge tone="good">Visible</Badge> : <Badge>Hidden</Badge>) },
        { head: '', cell: (c: any) => { const i = items.indexOf(c); return <div className="flex justify-end gap-1"><button aria-label="Move up" className="rounded p-1.5 hover:bg-navy/5" onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button><button aria-label="Move down" className="rounded p-1.5 hover:bg-navy/5" onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button><button aria-label={`Edit ${c.name}`} className="rounded p-1.5 hover:bg-navy/5" onClick={() => { setErr(''); setEdit({ ...c, parent: c.parent ?? '', seoTitle: c.seo?.title, seoDescription: c.seo?.description }); }}><Pencil className="h-4 w-4" /></button><Button size="sm" variant="ghost" onClick={() => setDel(c)}>Delete</Button></div>; } }]} />
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?._id ? 'Edit category' : 'New category'} wide>
        {edit && <div className="space-y-4">{err && <Alert>{err}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="Slug"><Input value={edit.slug ?? ''} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} placeholder="auto" /></Field>
            <Field label="Parent category (makes this a subcategory)"><Select value={edit.parent ?? ''} onChange={(e) => setEdit({ ...edit, parent: e.target.value })}><option value="">None (top level)</option>{items.filter((c) => !c.parent && c._id !== edit._id).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field>
            <div className="flex items-end gap-6"><Toggle label="Visible" checked={edit.isActive !== false} onChange={(v) => setEdit({ ...edit, isActive: v })} /><Toggle label="Show on homepage" checked={!!edit.showOnHome} onChange={(v) => setEdit({ ...edit, showOnHome: v })} /></div>
            <Field label="Description" className="sm:col-span-2"><Textarea rows={3} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Meta title"><Input value={edit.seoTitle ?? ''} onChange={(e) => setEdit({ ...edit, seoTitle: e.target.value })} /></Field><Field label="Meta description"><Input value={edit.seoDescription ?? ''} onChange={(e) => setEdit({ ...edit, seoDescription: e.target.value })} /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy/80">Card image</span><ImageUploader single folder="categories" images={edit.image ? [edit.image as Img] : []} onChange={(i) => setEdit({ ...edit, image: i[0] ?? null })} /></div><div><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy/80">Banner image</span><ImageUploader single folder="categories" images={edit.banner ? [edit.banner as Img] : []} onChange={(i) => setEdit({ ...edit, banner: i[0] ?? null })} /></div></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate(edit)}>Save</Button></div></div>}
      </Modal>
      <ConfirmDialog open={!!del} danger title={`Delete “${del?.name}”?`} message={del?.productCount ? `It has ${del.productCount} product(s), so it will be archived (hidden) rather than deleted. Products keep their category link.` : 'This cannot be undone.'} confirmLabel={del?.productCount ? 'Archive' : 'Delete'} onClose={() => setDel(null)} onConfirm={() => rm.mutate(del._id)} />
    </div>
  );
}

export function InventoryAdmin() {
  const qc = useQueryClient(); const toast = useToast(); const [page, setPage] = useState(1);
  const low = useQuery({ queryKey: ['admin', 'low-stock'], queryFn: () => api.get<{ items: any[] }>('/admin/inventory/low-stock') });
  const mv = useQuery({ queryKey: ['admin', 'movements', page], queryFn: () => api.get<Paged<any>>('/admin/inventory/movements', { page }) });
  const [adj, setAdj] = useState<any>(null); const [mode, setMode] = useState<'restock' | 'set'>('restock'); const [val, setVal] = useState(''); const [note, setNote] = useState('');
  const run = useMutation({ mutationFn: () => api.post('/admin/inventory/adjust', { productId: adj.productId, variantId: adj.variantId, ...(mode === 'set' ? { setTo: Number(val) } : { delta: Number(val) }), reason: mode === 'restock' ? 'restock' : 'adjustment', note: note || undefined }), onSuccess: () => { toast('success', 'Stock updated.'); setAdj(null); setVal(''); setNote(''); qc.invalidateQueries({ queryKey: ['admin'] }); }, onError: (e) => toast('error', errMsg(e)) });
  const products = useQuery({ queryKey: ['admin', 'products', 'inv'], queryFn: () => api.get<Paged<any>>('/admin/products', { limit: 100 }) });
  const rows = (products.data?.items ?? []).flatMap((p: any) => (p.variants?.length ? p.variants.map((v: any) => ({ productId: p._id, variantId: v._id, name: `${p.name} — ${v.name}`, sku: v.sku, stock: v.stock, reserved: v.reserved ?? 0 })) : [{ productId: p._id, name: p.name, sku: p.sku, stock: p.stock, reserved: p.reserved ?? 0 }]));
  return (
    <div className="space-y-8"><PageHead title="Inventory" sub="Every change is logged. “Reserved” units are held for unpaid orders." />
      {low.data && low.data.items.length > 0 && <Alert tone="warn"><b>{low.data.items.length}</b> item(s) at or below their low-stock threshold: {low.data.items.slice(0, 5).map((i) => `${i.name} (${i.stock})`).join(', ')}{low.data.items.length > 5 && '…'}</Alert>}
      <Table loading={products.isLoading} rows={rows} empty="No products yet." cols={[{ head: 'Product', cell: (r: any) => r.name }, { head: 'SKU', cell: (r: any) => r.sku }, { head: 'Available', cell: (r: any) => <b className={r.stock <= 0 ? 'text-red-600' : ''}>{r.stock}</b> }, { head: 'Reserved', cell: (r: any) => r.reserved }, { head: '', cell: (r: any) => <div className="text-right"><Button size="sm" variant="outline" onClick={() => { setAdj(r); setMode('restock'); }}>Adjust</Button></div> }]} />
      <section><h2 className="mb-2 text-2xl">Stock movements</h2><Table loading={mv.isLoading} rows={mv.data?.items} cols={[{ head: 'When', cell: (m: any) => dateTime(m.at) }, { head: 'Product', cell: (m: any) => m.product?.name ?? '—' }, { head: 'SKU', cell: (m: any) => m.sku }, { head: 'Change', cell: (m: any) => <b className={m.delta < 0 ? 'text-red-600' : 'text-emerald-700'}>{m.delta > 0 ? '+' : ''}{m.delta}</b> }, { head: 'Reason', cell: (m: any) => m.reason.replace('_', ' ') }, { head: 'Balance', cell: (m: any) => m.balanceAfter ?? '—' }, { head: 'By', cell: (m: any) => m.by?.firstName ?? 'system' }]} />{mv.data && <Pagination page={mv.data.page} pages={mv.data.pages} onChange={setPage} />}</section>
      <Modal open={!!adj} onClose={() => setAdj(null)} title={`Adjust stock · ${adj?.name ?? ''}`}>
        <div className="space-y-4"><p className="text-sm text-muted">Current available: <b>{adj?.stock}</b></p><Field label="Type"><Select value={mode} onChange={(e) => setMode(e.target.value as any)}><option value="restock">Add / remove units (use a negative number to remove)</option><option value="set">Set exact quantity (stock count)</option></Select></Field>
          <Field label={mode === 'set' ? 'New quantity' : 'Units to add'}><Input inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d-]/g, ''))} /></Field><Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAdj(null)}>Cancel</Button><Button disabled={val === '' || val === '-'} loading={run.isPending} onClick={() => run.mutate()}>Apply</Button></div></div>
      </Modal>
    </div>
  );
}
