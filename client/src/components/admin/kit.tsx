import { useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Star, X } from 'lucide-react';
import clsx from 'clsx';
import { api, errMsg } from '@/services/api';
import { Alert, Button, Spinner } from '@/components/ui';
import type { Img } from '@/types';

export const PageHead = ({ title, children, sub }: { title: string; sub?: string; children?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-4xl">{title}</h1>{sub && <p className="mt-1 text-sm text-muted">{sub}</p>}</div><div className="flex flex-wrap gap-2">{children}</div></div>
);

export interface Col<T> { head: string; cell: (r: T) => ReactNode; className?: string }
export function Table<T>({ cols, rows, loading, empty = 'Nothing here yet.', onRow }: { cols: Col<T>[]; rows?: T[]; loading?: boolean; empty?: string; onRow?: (r: T) => void }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line bg-cream text-xs uppercase tracking-wide text-muted"><tr>{cols.map((c) => <th key={c.head} scope="col" className={clsx('px-4 py-3 font-semibold', c.className)}>{c.head}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {loading ? <tr><td colSpan={cols.length} className="px-4 py-10 text-center"><Spinner className="mx-auto" /></td></tr> : !rows?.length ? <tr><td colSpan={cols.length} className="px-4 py-10 text-center text-muted">{empty}</td></tr>
            : rows.map((r, i) => <tr key={i} onClick={() => onRow?.(r)} className={clsx(onRow && 'cursor-pointer hover:bg-cream')}>{cols.map((c) => <td key={c.head} className={clsx('px-4 py-3 align-middle', c.className)}>{c.cell(r)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export const Stat = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: 'warn' | 'good' }) => (
  <div className="card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div><div className={clsx('mt-1 text-2xl font-bold', tone === 'warn' ? 'text-amber-600' : tone === 'good' ? 'text-emerald-700' : 'text-navy')}>{value}</div>{sub && <div className="text-xs text-muted">{sub}</div>}</div>
);

/** Uploads to the PUBLIC image store (product photos, banners, logo, QR). Payment evidence never goes through this. */
export function ImageUploader({ images, onChange, folder, max = 12, single }: { images: Img[]; onChange: (i: Img[]) => void; folder: 'products' | 'categories' | 'site' | 'payment-qr'; max?: number; single?: boolean }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const input = useRef<HTMLInputElement>(null);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return; setBusy(true); setErr(''); const next = [...images];
    try { for (const file of Array.from(files).slice(0, max - images.length || 1)) { const f = new FormData(); f.set('folder', folder); f.set('file', file); const r = await api.upload<{ url: string; publicId: string }>('/admin/uploads/image', f); const item = { url: r.url, publicId: r.publicId, alt: '', isPrimary: next.length === 0 }; if (single) next.splice(0, next.length, item); else next.push(item); } onChange(next); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const move = (i: number, d: number) => { const n = [...images]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((im, i) => (
          <div key={im.url + i} className="rounded-xl border border-line bg-white p-2">
            <div className="relative aspect-square overflow-hidden rounded-lg bg-cream"><img src={im.url} alt={im.alt || ''} className="h-full w-full object-cover" />{im.isPrimary && !single && <span className="absolute left-1 top-1 rounded bg-gold px-1.5 text-[10px] font-bold text-navy">Primary</span>}</div>
            {!single && <input aria-label="Alt text" placeholder="Alt text" value={im.alt ?? ''} onChange={(e) => onChange(images.map((x, k) => (k === i ? { ...x, alt: e.target.value } : x)))} className="input mt-2 py-1.5 text-xs" />}
            <div className="mt-2 flex items-center justify-between">
              <div className="flex gap-1"><button type="button" aria-label="Move earlier" onClick={() => move(i, -1)} className="rounded p-1 hover:bg-navy/5"><ArrowUp className="h-3.5 w-3.5 -rotate-90" /></button><button type="button" aria-label="Move later" onClick={() => move(i, 1)} className="rounded p-1 hover:bg-navy/5"><ArrowDown className="h-3.5 w-3.5 -rotate-90" /></button>{!single && <button type="button" aria-label="Make primary" onClick={() => onChange(images.map((x, k) => ({ ...x, isPrimary: k === i })))} className="rounded p-1 hover:bg-navy/5"><Star className={clsx('h-3.5 w-3.5', im.isPrimary && 'fill-gold text-gold')} /></button>}</div>
              <button type="button" aria-label="Remove image" onClick={() => { const n = images.filter((_, k) => k !== i); if (n.length && !n.some((x) => x.isPrimary)) n[0].isPrimary = true; onChange(n); }} className="rounded p-1 text-red-600 hover:bg-red-50"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
        {(single ? images.length === 0 : images.length < max) && <button type="button" onClick={() => input.current?.click()} disabled={busy} className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-line text-sm text-muted hover:border-navy hover:text-navy">{busy ? <Spinner /> : <span className="grid place-items-center gap-1"><ImagePlus className="h-6 w-6" />Add image</span>}</button>}
      </div>
      <input ref={input} type="file" hidden multiple={!single} accept="image/jpeg,image/png,image/webp" onChange={(e) => upload(e.target.files)} />
      {err && <Alert>{err}</Alert>}
    </div>
  );
}

export const SectionCard = ({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) => <section className="card space-y-4 p-5"><div><h2 className="text-2xl">{title}</h2>{hint && <p className="text-xs text-muted">{hint}</p>}</div>{children}</section>;
export const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-navy))]" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
export const SaveBar = ({ saving, onSave, children }: { saving?: boolean; onSave: () => void; children?: ReactNode }) => <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-line bg-cream/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">{children}<Button onClick={onSave} loading={saving}>Save changes</Button></div>;
