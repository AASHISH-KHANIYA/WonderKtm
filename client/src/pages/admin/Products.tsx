import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError, errMsg } from '@/services/api';
import { Alert, Badge, Button, ConfirmDialog, Field, Input, PageLoader, Pagination, Select, Textarea, statusTone, useToast } from '@/components/ui';
import { ImageUploader, PageHead, SaveBar, SectionCard, Table, Toggle } from '@/components/admin/kit';
import { money, img } from '@/utils/format';
import type { Category, Img, Paged } from '@/types';

export function ProductsList() {
  const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ q: '', status: '', category: '', page: 1 }); const [del, setDel] = useState<any>(null);
  const cats = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api.get<{ items: any[] }>('/admin/categories') });
  const r = useQuery({ queryKey: ['admin', 'products', f], queryFn: () => api.get<Paged<any>>('/admin/products', f), placeholderData: (p) => p });
  const dup = useMutation({ mutationFn: (id: string) => api.post<{ product: any }>(`/admin/products/${id}/duplicate`), onSuccess: (x) => { toast('success', 'Duplicated as a draft.'); nav(`/admin/products/${x.product._id}`); } });
  const rm = useMutation({ mutationFn: (id: string) => api.del<any>(`/admin/products/${id}`), onSuccess: (x) => { toast('success', x.message ?? 'Product deleted.'); setDel(null); qc.invalidateQueries({ queryKey: ['admin', 'products'] }); }, onError: (e) => { toast('error', errMsg(e)); setDel(null); } });
  const stat = useMutation({ mutationFn: ({ id, status }: any) => api.patch(`/admin/products/${id}/status`, { status }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'products'] }) });
  return (
    <div><PageHead title="Products"><a className="btn-outline btn-sm" href="/api/admin/products/export.csv">Export inventory CSV</a><Link to="/admin/products/new" className="btn-primary btn-sm"><Plus className="h-4 w-4" />Add product</Link></PageHead>
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3"><Field label="Search"><Input placeholder="Name or SKU" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} /></Field><Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}><option value="">All (not archived)</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></Select></Field><Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, page: 1 })}><option value="">All</option>{cats.data?.items.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field></div>
      <Table loading={r.isLoading} rows={r.data?.items} empty="No products yet. Add your first product." cols={[
        { head: 'Product', cell: (p: any) => <Link to={`/admin/products/${p._id}`} className="flex items-center gap-3"><img src={img(p.images?.[0]?.url)} alt="" className="h-10 w-10 rounded object-cover" /><span className="font-semibold text-navy hover:underline">{p.name}</span></Link> },
        { head: 'SKU', cell: (p: any) => p.sku }, { head: 'Category', cell: (p: any) => p.category?.name ?? '—' }, { head: 'Price', cell: (p: any) => <>{money(p.salePrice ?? p.price)}{p.salePrice != null && <span className="ml-1 text-xs text-muted line-through">{money(p.price)}</span>}</> },
        { head: 'Stock', cell: (p: any) => { const s = p.variants?.length ? p.variants.reduce((a: number, v: any) => a + v.stock, 0) : p.stock; return <span className={s <= (p.lowStockThreshold ?? 5) ? 'font-semibold text-amber-600' : ''}>{s}</span>; } },
        { head: 'Status', cell: (p: any) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> },
        { head: '', cell: (p: any) => <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}><Button size="sm" variant="ghost" onClick={() => stat.mutate({ id: p._id, status: p.status === 'published' ? 'draft' : 'published' })}>{p.status === 'published' ? 'Unpublish' : 'Publish'}</Button><Button size="sm" variant="ghost" onClick={() => dup.mutate(p._id)}>Duplicate</Button><button aria-label={`Delete ${p.name}`} className="rounded p-1.5 text-red-600 hover:bg-red-50" onClick={() => setDel(p)}><Trash2 className="h-4 w-4" /></button></div> }]} />
      {r.data && <Pagination page={r.data.page} pages={r.data.pages} onChange={(p) => setF({ ...f, page: p })} />}
      <ConfirmDialog open={!!del} danger title={`Delete “${del?.name}”?`} message="Products that appear in past orders are archived instead of deleted, so order history stays intact." confirmLabel="Delete" loading={rm.isPending} onClose={() => setDel(null)} onConfirm={() => rm.mutate(del._id)} />
    </div>
  );
}

const blank = { name: '', slug: '', sku: '', shortDescription: '', description: '', category: '', subcategory: '', collections: '', tags: '', images: [] as Img[], price: '', salePrice: '', saleStart: '', saleEnd: '', inrPrice: '', inrSalePrice: '', stock: '0', lowStockThreshold: '5', variants: [] as any[], dimensions: '', materials: '', careInstructions: '', specifications: [] as { label: string; value: string }[], deliveryRestrictions: '', status: 'draft', isFeatured: false, isNewArrival: false, seoTitle: '', seoDescription: '' };
const num = (s: string) => (s === '' || s == null ? null : Number(s));
const dt = (d?: string) => (d ? new Date(d).toISOString().slice(0, 16) : '');

export function ProductEditor() {
  const { id } = useParams(); const isNew = !id || id === 'new'; const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast();
  const [s, setS] = useState<any>(blank); const [errs, setErrs] = useState<Record<string, string>>({}); const [top, setTop] = useState('');
  const cats = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api.get<{ items: (Category & { _id: string })[] }>('/admin/categories') });
  const q = useQuery({ queryKey: ['admin', 'product', id], queryFn: () => api.get<any>(`/admin/products/${id}`), enabled: !isNew });
  useEffect(() => {
    const p = q.data?.product; if (!p) return;
    setS({ ...blank, ...p, category: p.category ?? '', subcategory: p.subcategory ?? '', collections: (p.collections ?? []).join(', '), tags: (p.tags ?? []).join(', '), deliveryRestrictions: (p.deliveryRestrictions ?? []).join(', '), price: String(p.price ?? ''), salePrice: p.salePrice ?? '', inrPrice: p.inrPrice ?? '', inrSalePrice: p.inrSalePrice ?? '', saleStart: dt(p.saleStart), saleEnd: dt(p.saleEnd), stock: String(p.stock ?? 0), lowStockThreshold: String(p.lowStockThreshold ?? 5), images: p.images ?? [], variants: (p.variants ?? []).map((v: any) => ({ ...v, price: v.price ?? '', salePrice: v.salePrice ?? '', inrPrice: v.inrPrice ?? '' })), seoTitle: p.seo?.title ?? '', seoDescription: p.seo?.description ?? '' });
  }, [q.data]);
  const set = (k: string, v: any) => setS((x: any) => ({ ...x, [k]: v }));
  const list = (x: string) => x.split(',').map((t) => t.trim()).filter(Boolean);
  const parents = (cats.data?.items ?? []).filter((c) => !c.parent); const subs = (cats.data?.items ?? []).filter((c) => c.parent && String(c.parent) === String(s.category));

  const save = useMutation({
    mutationFn: (status?: string) => {
      const body: any = {
        name: s.name, slug: s.slug || undefined, sku: s.sku, shortDescription: s.shortDescription, description: s.description, category: s.category || null, subcategory: s.subcategory || null, collections: list(s.collections), tags: list(s.tags),
        images: s.images, price: Number(s.price), salePrice: num(s.salePrice), saleStart: s.saleStart ? new Date(s.saleStart).toISOString() : null, saleEnd: s.saleEnd ? new Date(s.saleEnd).toISOString() : null, inrPrice: num(s.inrPrice), inrSalePrice: num(s.inrSalePrice),
        stock: Number(s.stock || 0), lowStockThreshold: Number(s.lowStockThreshold || 0), dimensions: s.dimensions, materials: s.materials, careInstructions: s.careInstructions, specifications: s.specifications.filter((x: any) => x.label && x.value), deliveryRestrictions: list(s.deliveryRestrictions),
        status: status ?? s.status, isFeatured: s.isFeatured, isNewArrival: s.isNewArrival, seo: { title: s.seoTitle, description: s.seoDescription },
        variants: s.variants.map((v: any) => ({ _id: v._id, sku: v.sku, name: v.name, options: v.options ?? {}, price: num(String(v.price)), salePrice: num(String(v.salePrice)), inrPrice: num(String(v.inrPrice)), stock: Number(v.stock || 0), active: v.active !== false })),
      };
      return isNew ? api.post<{ product: any }>('/admin/products', body) : api.put<{ product: any }>(`/admin/products/${id}`, body);
    },
    onSuccess: (r, status) => { setErrs({}); setTop(''); toast('success', status === 'published' ? 'Published.' : 'Saved.'); qc.invalidateQueries({ queryKey: ['admin'] }); if (isNew) nav(`/admin/products/${r.product._id}`, { replace: true }); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrs(Object.fromEntries(e.fields.map((f) => [f.path.split('.')[0], f.message]))); setTop(errMsg(e)); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  });
  if (!isNew && q.isLoading) return <PageLoader />;
  const E = (k: string) => errs[k];
  return (
    <div className="space-y-5">
      <PageHead title={isNew ? 'New product' : s.name || 'Edit product'} sub={isNew ? 'Saved as a draft until you publish.' : `Status: ${s.status}`}><Link to="/admin/products" className="btn-ghost btn-sm">← Back</Link></PageHead>
      {top && <Alert>{top}{Object.values(errs).length > 0 && <ul className="mt-1 list-disc pl-5">{Object.entries(errs).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>}</Alert>}
      <SectionCard title="Basics">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Name" error={E('name')} className="sm:col-span-2"><Input value={s.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="SKU" error={E('sku')}><Input value={s.sku} onChange={(e) => set('sku', e.target.value)} /></Field><Field label="URL slug" hint="Leave blank to generate. Old URLs keep redirecting if you change it."><Input value={s.slug} onChange={(e) => set('slug', e.target.value)} /></Field>
          <Field label="Category"><Select value={s.category} onChange={(e) => setS({ ...s, category: e.target.value, subcategory: '' })}><option value="">None</option>{parents.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field>
          <Field label="Subcategory"><Select value={s.subcategory} onChange={(e) => set('subcategory', e.target.value)} disabled={!subs.length}><option value="">None</option>{subs.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field>
          <Field label="Short description" className="sm:col-span-2"><Input value={s.shortDescription} maxLength={400} onChange={(e) => set('shortDescription', e.target.value)} /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea rows={6} value={s.description} onChange={(e) => set('description', e.target.value)} /></Field></div></SectionCard>
      <SectionCard title="Images" hint="The first image marked ★ is the primary image. Use the arrows to reorder. Add descriptive alt text."><ImageUploader images={s.images} onChange={(i) => set('images', i)} folder="products" /></SectionCard>
      <SectionCard title="Pricing" hint="NPR is the base currency. Add an INR price only if you sell to India.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Regular price (NPR)" error={E('price')}><Input inputMode="decimal" value={s.price} onChange={(e) => set('price', e.target.value)} /></Field><Field label="Sale price (NPR)" error={E('salePrice')}><Input inputMode="decimal" value={s.salePrice} onChange={(e) => set('salePrice', e.target.value)} /></Field>
          <Field label="Sale starts"><Input type="datetime-local" value={s.saleStart} onChange={(e) => set('saleStart', e.target.value)} /></Field><Field label="Sale ends"><Input type="datetime-local" value={s.saleEnd} onChange={(e) => set('saleEnd', e.target.value)} /></Field>
          <Field label="INR price (optional)"><Input inputMode="decimal" value={s.inrPrice} onChange={(e) => set('inrPrice', e.target.value)} /></Field><Field label="INR sale price"><Input inputMode="decimal" value={s.inrSalePrice} onChange={(e) => set('inrSalePrice', e.target.value)} /></Field></div></SectionCard>
      <SectionCard title="Inventory" hint={isNew ? 'Opening stock.' : 'To change stock use Inventory (adjustments are logged). The value below is read-only.'}>
        <div className="grid gap-4 sm:grid-cols-3"><Field label="Stock (when no variants)"><Input inputMode="numeric" value={s.stock} disabled={!isNew} onChange={(e) => set('stock', e.target.value.replace(/\D/g, ''))} /></Field><Field label="Low-stock alert at"><Input inputMode="numeric" value={s.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value.replace(/\D/g, ''))} /></Field></div></SectionCard>
      <SectionCard title="Variants" hint="Optional. When variants exist, customers must choose one; each has its own SKU, price and stock.">
        {s.variants.map((v: any, i: number) => (
          <div key={v._id ?? i} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-6">
            <Field label="Name" className="sm:col-span-2"><Input value={v.name} onChange={(e) => set('variants', s.variants.map((x: any, k: number) => (k === i ? { ...x, name: e.target.value } : x)))} /></Field><Field label="SKU"><Input value={v.sku} onChange={(e) => set('variants', s.variants.map((x: any, k: number) => (k === i ? { ...x, sku: e.target.value } : x)))} /></Field>
            <Field label="Price (NPR)"><Input inputMode="decimal" placeholder="same" value={v.price} onChange={(e) => set('variants', s.variants.map((x: any, k: number) => (k === i ? { ...x, price: e.target.value } : x)))} /></Field><Field label="Sale"><Input inputMode="decimal" value={v.salePrice} onChange={(e) => set('variants', s.variants.map((x: any, k: number) => (k === i ? { ...x, salePrice: e.target.value } : x)))} /></Field>
            <Field label="Stock"><Input inputMode="numeric" value={v.stock ?? 0} disabled={!!v._id} onChange={(e) => set('variants', s.variants.map((x: any, k: number) => (k === i ? { ...x, stock: e.target.value.replace(/\D/g, '') } : x)))} /></Field>
            <div className="flex items-center justify-between sm:col-span-6"><Toggle label="Active" checked={v.active !== false} onChange={(c) => set('variants', s.variants.map((x: any, k: number) => (k === i ? { ...x, active: c } : x)))} /><button type="button" className="text-xs font-semibold text-red-600 underline" onClick={() => set('variants', s.variants.filter((_: any, k: number) => k !== i))}>Remove</button></div></div>))}
        <Button variant="outline" size="sm" onClick={() => set('variants', [...s.variants, { name: '', sku: s.sku ? `${s.sku}-${s.variants.length + 1}` : '', price: '', salePrice: '', stock: 0, active: true }])}><Plus className="h-4 w-4" />Add variant</Button></SectionCard>
      <SectionCard title="Details" hint="Only enter what you can confirm. Empty fields are not shown to customers.">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Dimensions"><Input value={s.dimensions} onChange={(e) => set('dimensions', e.target.value)} /></Field><Field label="Materials"><Input value={s.materials} onChange={(e) => set('materials', e.target.value)} /></Field><Field label="Care instructions" className="sm:col-span-2"><Input value={s.careInstructions} onChange={(e) => set('careInstructions', e.target.value)} /></Field></div>
        {s.specifications.map((x: any, i: number) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2"><Input aria-label="Specification name" placeholder="Name" value={x.label} onChange={(e) => set('specifications', s.specifications.map((y: any, k: number) => (k === i ? { ...y, label: e.target.value } : y)))} /><Input aria-label="Specification value" placeholder="Value" value={x.value} onChange={(e) => set('specifications', s.specifications.map((y: any, k: number) => (k === i ? { ...y, value: e.target.value } : y)))} /><button type="button" aria-label="Remove specification" className="text-red-600" onClick={() => set('specifications', s.specifications.filter((_: any, k: number) => k !== i))}><Trash2 className="h-4 w-4" /></button></div>)}
        <Button variant="ghost" size="sm" onClick={() => set('specifications', [...s.specifications, { label: '', value: '' }])}><Plus className="h-4 w-4" />Add specification</Button></SectionCard>
      <SectionCard title="Merchandising & delivery">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Collections (comma separated)"><Input value={s.collections} onChange={(e) => set('collections', e.target.value)} /></Field><Field label="Tags (comma separated)"><Input value={s.tags} onChange={(e) => set('tags', e.target.value)} /></Field>
          <Field label="Cannot be delivered to (cities, comma separated)" className="sm:col-span-2"><Input value={s.deliveryRestrictions} onChange={(e) => set('deliveryRestrictions', e.target.value)} /></Field></div>
        <div className="flex flex-wrap gap-6"><Toggle label="Featured" checked={s.isFeatured} onChange={(v) => set('isFeatured', v)} /><Toggle label="New arrival" checked={s.isNewArrival} onChange={(v) => set('isNewArrival', v)} /></div></SectionCard>
      <SectionCard title="SEO"><div className="grid gap-4"><Field label="Meta title"><Input value={s.seoTitle} maxLength={120} onChange={(e) => set('seoTitle', e.target.value)} /></Field><Field label="Meta description"><Textarea rows={2} maxLength={300} value={s.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} /></Field></div></SectionCard>
      {!isNew && q.data?.movements?.length > 0 && <SectionCard title="Stock history"><ul className="space-y-1 text-xs text-muted">{q.data.movements.slice(0, 15).map((m: any) => <li key={m._id}>{new Date(m.at).toLocaleString()} · {m.delta > 0 ? '+' : ''}{m.delta} · {m.reason.replace('_', ' ')}{m.balanceAfter != null && ` · balance ${m.balanceAfter}`}</li>)}</ul></SectionCard>}
      <SaveBar saving={save.isPending} onSave={() => save.mutate(undefined)}>{s.status !== 'published' ? <Button variant="accent" loading={save.isPending} onClick={() => save.mutate('published')}>Publish</Button> : <Button variant="outline" onClick={() => save.mutate('draft')}>Unpublish (save as draft)</Button>}</SaveBar>
    </div>
  );
}
