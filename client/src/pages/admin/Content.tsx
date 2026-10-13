import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { api, errMsg } from '@/services/api';
import { Alert, Badge, Button, ConfirmDialog, Field, Input, Modal, PageLoader, Select, Textarea, statusTone, useToast } from '@/components/ui';
import { ImageUploader, PageHead, SectionCard, Table, Toggle } from '@/components/admin/kit';
import { date, dateTime } from '@/utils/format';

const SECTION_TYPES = [['categories', 'Categories'], ['newArrivals', 'New arrivals'], ['offers', 'Special offers'], ['bestSellers', 'Best sellers'], ['featured', 'Featured products'], ['collection', 'A collection'], ['about', 'About us'], ['trust', 'Trust points'], ['social', 'Social links']];

function useBlock(key: string) {
  const qc = useQueryClient(); const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'content', key], queryFn: () => api.get<{ draft: any; published: any; publishedAt?: string }>(`/admin/content/${key}`) });
  const [d, setD] = useState<any>(null); useEffect(() => { if (q.data) setD(q.data.draft); }, [q.data]);
  const save = useMutation({ mutationFn: () => api.put(`/admin/content/${key}`, d), onSuccess: () => { toast('success', 'Draft saved. Not live until you publish.'); qc.invalidateQueries({ queryKey: ['admin', 'content', key] }); }, onError: (e) => toast('error', errMsg(e)) });
  const publish = useMutation({ mutationFn: async () => { await api.put(`/admin/content/${key}`, d); await api.post(`/admin/content/${key}/publish`); }, onSuccess: () => { toast('success', 'Published.'); qc.invalidateQueries({ queryKey: ['admin', 'content', key] }); qc.invalidateQueries({ queryKey: ['content', key] }); qc.invalidateQueries({ queryKey: ['site'] }); }, onError: (e) => toast('error', errMsg(e)) });
  return { q, d, setD, save, publish };
}
const Actions = ({ b, preview }: { b: ReturnType<typeof useBlock>; preview?: string }) => <div className="flex flex-wrap gap-2">{preview && <a className="btn-ghost btn-sm" href={preview} target="_blank" rel="noopener noreferrer">Preview draft</a>}<Button size="sm" variant="outline" loading={b.save.isPending} onClick={() => b.save.mutate()}>Save draft</Button><Button size="sm" loading={b.publish.isPending} onClick={() => b.publish.mutate()}>Publish</Button></div>;

function Homepage() {
  const b = useBlock('homepage'); const d = b.d;
  if (!d) return <PageLoader />;
  const hero = d.hero ?? {}; const sections: any[] = d.sections ?? []; const trust: any[] = d.trust ?? [];
  const setHero = (k: string, v: any) => b.setD({ ...d, hero: { ...hero, [k]: v } }); const setSec = (s: any[]) => b.setD({ ...d, sections: s });
  const move = (i: number, dir: number) => { const n = [...sections]; const j = i + dir; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setSec(n); };
  return (
    <SectionCard title="Homepage" hint="Hero, section order and visibility. Changes go live only when you publish.">
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Headline" className="sm:col-span-2"><Input value={hero.headline ?? ''} onChange={(e) => setHero('headline', e.target.value)} /></Field><Field label="Sub-headline" className="sm:col-span-2"><Input value={hero.subheadline ?? ''} onChange={(e) => setHero('subheadline', e.target.value)} /></Field>
        <Field label="Button label"><Input value={hero.ctaLabel ?? ''} onChange={(e) => setHero('ctaLabel', e.target.value)} /></Field><Field label="Button link"><Input value={hero.ctaLink ?? ''} onChange={(e) => setHero('ctaLink', e.target.value)} placeholder="/shop" /></Field>
        <Field label="Second button label"><Input value={hero.secondaryLabel ?? ''} onChange={(e) => setHero('secondaryLabel', e.target.value)} /></Field><Field label="Second button link"><Input value={hero.secondaryLink ?? ''} onChange={(e) => setHero('secondaryLink', e.target.value)} /></Field></div>
      <div><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-navy/80">Hero background image (optional)</span><ImageUploader single folder="site" images={hero.image ? [{ url: hero.image }] : []} onChange={(i) => setHero('image', i[0]?.url ?? '')} /></div>
      <div><h3 className="mb-2 font-sans text-sm font-bold">Sections (top to bottom)</h3><div className="space-y-2">{sections.map((s, i) => (
        <div key={i} className="grid items-center gap-2 rounded-xl border border-line p-2 sm:grid-cols-[auto_1fr_1fr_auto]"><Toggle label="" checked={s.enabled} onChange={(v) => setSec(sections.map((x, k) => (k === i ? { ...x, enabled: v } : x)))} />
          <Select aria-label="Section type" value={s.type} onChange={(e) => setSec(sections.map((x, k) => (k === i ? { ...x, type: e.target.value } : x)))}>{SECTION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          {s.type === 'collection' ? <Input aria-label="Collection name" placeholder="Collection name" value={s.collection ?? ''} onChange={(e) => setSec(sections.map((x, k) => (k === i ? { ...x, collection: e.target.value } : x)))} /> : <Input aria-label="Section title" placeholder="Title (optional)" value={s.title ?? ''} onChange={(e) => setSec(sections.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />}
          <div className="flex gap-1"><button aria-label="Move up" onClick={() => move(i, -1)} className="rounded p-1.5 hover:bg-navy/5"><ArrowUp className="h-4 w-4" /></button><button aria-label="Move down" onClick={() => move(i, 1)} className="rounded p-1.5 hover:bg-navy/5"><ArrowDown className="h-4 w-4" /></button><button aria-label="Remove section" onClick={() => setSec(sections.filter((_, k) => k !== i))} className="rounded p-1.5 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div></div>))}</div>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => setSec([...sections, { type: 'featured', enabled: true, title: '' }])}><Plus className="h-4 w-4" />Add section</Button></div>
      <div><h3 className="mb-2 font-sans text-sm font-bold">Trust points</h3>{trust.map((t, i) => <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]"><Input aria-label="Title" value={t.title} onChange={(e) => b.setD({ ...d, trust: trust.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) })} /><Input aria-label="Text" value={t.text} onChange={(e) => b.setD({ ...d, trust: trust.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)) })} /><button aria-label="Remove" className="text-red-600" onClick={() => b.setD({ ...d, trust: trust.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></button></div>)}<Alert tone="info">Only add claims you can back up (e.g. delivery times, verification process).</Alert><Button variant="outline" size="sm" className="mt-2" onClick={() => b.setD({ ...d, trust: [...trust, { title: '', text: '' }] })}>Add point</Button></div>
      <Actions b={b} />
    </SectionCard>
  );
}

function Simple({ k, title, fields, hint }: { k: string; title: string; hint?: string; fields: { key: string; label: string; area?: boolean; bool?: boolean }[] }) {
  const b = useBlock(k); if (!b.d) return <PageLoader />;
  return (
    <SectionCard title={title} hint={hint}><div className="grid gap-4">{fields.map((f) => f.bool ? <Toggle key={f.key} label={f.label} checked={!!b.d[f.key]} onChange={(v) => b.setD({ ...b.d, [f.key]: v })} /> : <Field key={f.key} label={f.label}>{f.area ? <Textarea rows={5} value={b.d[f.key] ?? ''} onChange={(e) => b.setD({ ...b.d, [f.key]: e.target.value })} /> : <Input value={b.d[f.key] ?? ''} onChange={(e) => b.setD({ ...b.d, [f.key]: e.target.value })} />}</Field>)}</div><Actions b={b} /></SectionCard>
  );
}

function Footer() {
  const b = useBlock('footer'); if (!b.d) return <PageLoader />; const links: any[] = b.d.links ?? [];
  return (
    <SectionCard title="Footer links"><div className="space-y-2">{links.map((l, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input aria-label="Label" value={l.label} onChange={(e) => b.setD({ ...b.d, links: links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} /><Input aria-label="Link" value={l.href} onChange={(e) => b.setD({ ...b.d, links: links.map((x, k) => (k === i ? { ...x, href: e.target.value } : x)) })} /><button aria-label="Remove" className="text-red-600" onClick={() => b.setD({ ...b.d, links: links.filter((_, k) => k !== i) })}><Trash2 className="h-4 w-4" /></button></div>)}</div><Button variant="outline" size="sm" onClick={() => b.setD({ ...b.d, links: [...links, { label: '', href: '/' }] })}>Add link</Button><Actions b={b} /></SectionCard>
  );
}

export function ContentAdmin() {
  const [tab, setTab] = useState('homepage');
  const tabs = [['homepage', 'Homepage'], ['announcement', 'Announcement bar'], ['about', 'About us'], ['contact', 'Contact'], ['shipping-info', 'Shipping info'], ['footer', 'Footer']];
  return (
    <div className="space-y-4"><PageHead title="Homepage & pages" sub="Edit as a draft, then publish. Social links, logo and brand colours live in Settings." />
      <div className="flex flex-wrap gap-1" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === k ? 'bg-navy text-white' : 'bg-white text-navy hover:bg-navy/5'}`}>{l}</button>)}</div>
      {tab === 'homepage' && <Homepage />}
      {tab === 'announcement' && <Simple k="announcement" title="Announcement bar" fields={[{ key: 'enabled', label: 'Show the bar', bool: true }, { key: 'text', label: 'Text' }, { key: 'link', label: 'Link (optional)' }]} />}
      {tab === 'about' && <Simple k="about" title="About us" fields={[{ key: 'title', label: 'Title' }, { key: 'body', label: 'Story', area: true }]} />}
      {tab === 'contact' && <Simple k="contact" title="Contact page" fields={[{ key: 'address', label: 'Address' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'hours', label: 'Hours' }]} />}
      {tab === 'shipping-info' && <Simple k="shipping-info" title="Shipping info (shown on product pages)" hint="Only state delivery promises that your shipping zones support." fields={[{ key: 'text', label: 'Text', area: true }]} />}
      {tab === 'footer' && <Footer />}
    </div>
  );
}

export function PoliciesAdmin() {
  const qc = useQueryClient(); const toast = useToast(); const { data } = useQuery({ queryKey: ['admin', 'policies'], queryFn: () => api.get<{ items: any[] }>('/admin/policies') });
  const [e, setE] = useState<any>(null); const [err, setErr] = useState(''); const [pub, setPub] = useState<any>(null);
  const re = () => qc.invalidateQueries({ queryKey: ['admin', 'policies'] });
  const save = useMutation({ mutationFn: (p: any) => (p._id ? api.put(`/admin/policies/${p._id}`, { title: p.title, body: p.body, effectiveDate: p.effectiveDate || undefined }) : api.post('/admin/policies', { slug: p.slug, title: p.title, body: p.body, effectiveDate: p.effectiveDate || undefined })), onSuccess: () => { setE(null); toast('success', 'Saved as a draft.'); re(); }, onError: (x) => setErr(errMsg(x)) });
  const act = useMutation({ mutationFn: ({ id, a }: any) => api.post(`/admin/policies/${id}/${a}`), onSuccess: () => { toast('success', 'Done.'); setPub(null); re(); }, onError: (x) => { toast('error', errMsg(x)); setPub(null); } });
  const items = data?.items ?? [];
  const latest = Object.values(items.reduce((m: any, p: any) => ((m[p.slug] = !m[p.slug] || p.version > m[p.slug].version ? p : m[p.slug]), m), {})) as any[];
  return (
    <div><PageHead title="Policies" sub="Seeded drafts are templates with [PLACEHOLDERS]. The owner must review before anything is published."><Button size="sm" onClick={() => { setErr(''); setE({ slug: '', title: '', body: '' }); }}><Plus className="h-4 w-4" />New policy page</Button></PageHead>
      <Alert tone="warn">These are drafts, not legal advice. Replace every [PLACEHOLDER] with confirmed details, and consider a legal review.</Alert>
      <div className="mt-4"><Table rows={latest} cols={[{ head: 'Page', cell: (p: any) => <b>{p.title}</b> }, { head: 'Slug', cell: (p: any) => p.slug }, { head: 'Version', cell: (p: any) => `v${p.version}` }, { head: 'Status', cell: (p: any) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> }, { head: 'Owner review', cell: (p: any) => (p.ownerReviewed ? <Badge tone="good">Reviewed</Badge> : <Badge tone="warn">Pending</Badge>) }, { head: 'Effective', cell: (p: any) => date(p.effectiveDate) },
        { head: '', cell: (p: any) => <div className="flex justify-end gap-1">{p.status === 'published' ? <><Button size="sm" variant="ghost" onClick={() => { setErr(''); setE({ slug: p.slug, title: p.title, body: p.body }); }}>New version</Button><Button size="sm" variant="ghost" onClick={() => act.mutate({ id: p._id, a: 'unpublish' })}>Unpublish</Button></> : <><Button size="sm" variant="ghost" onClick={() => { setErr(''); setE(p); }}>Edit</Button>{!p.ownerReviewed && <Button size="sm" variant="outline" onClick={() => act.mutate({ id: p._id, a: 'review' })}>Mark reviewed (owner)</Button>}<Button size="sm" disabled={!p.ownerReviewed} onClick={() => setPub(p)}>Publish</Button></>}</div> }]} /></div>
      <Modal open={!!e} wide onClose={() => setE(null)} title={e?._id ? `Edit ${e.title}` : 'Policy draft'}>{e && <div className="space-y-4">{err && <Alert>{err}</Alert>}<div className="grid gap-4 sm:grid-cols-2"><Field label="Title"><Input value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} /></Field><Field label="Slug"><Input value={e.slug} disabled={!!e._id} onChange={(x) => setE({ ...e, slug: x.target.value })} /></Field></div><Field label="Body (Markdown: # heading, ## subheading, - list, **bold**)"><Textarea rows={16} value={e.body} onChange={(x) => setE({ ...e, body: x.target.value })} /></Field><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setE(null)}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate(e)}>Save draft</Button></div></div>}</Modal>
      <ConfirmDialog open={!!pub} title={`Publish “${pub?.title}”?`} message="This makes the page public. If it is the Terms, the version number is recorded on every new order." confirmLabel="Publish" onClose={() => setPub(null)} onConfirm={() => act.mutate({ id: pub._id, a: 'publish' })} />
    </div>
  );
}

export function FaqsAdmin() {
  const qc = useQueryClient(); const { data } = useQuery({ queryKey: ['admin', 'faqs'], queryFn: () => api.get<{ items: any[] }>('/admin/faqs') });
  const [e, setE] = useState<any>(null); const re = () => qc.invalidateQueries({ queryKey: ['admin', 'faqs'] }); const toast = useToast();
  const save = useMutation({ mutationFn: (f: any) => (f._id ? api.put(`/admin/faqs/${f._id}`, { question: f.question, answer: f.answer, published: f.published !== false, sortOrder: Number(f.sortOrder || 0) }) : api.post('/admin/faqs', { question: f.question, answer: f.answer, published: f.published !== false, sortOrder: Number(f.sortOrder || 0) })), onSuccess: () => { setE(null); re(); qc.invalidateQueries({ queryKey: ['faqs'] }); }, onError: (x) => toast('error', errMsg(x)) });
  const rm = useMutation({ mutationFn: (id: string) => api.del(`/admin/faqs/${id}`), onSuccess: () => { re(); qc.invalidateQueries({ queryKey: ['faqs'] }); } });
  return (
    <div><PageHead title="FAQs" sub="Published FAQs appear on the FAQ page immediately."><Button size="sm" onClick={() => setE({ question: '', answer: '', published: true })}><Plus className="h-4 w-4" />Add FAQ</Button></PageHead>
      <Table rows={data?.items} empty="No FAQs." onRow={setE} cols={[{ head: 'Question', cell: (f: any) => f.question }, { head: 'Order', cell: (f: any) => f.sortOrder }, { head: 'Status', cell: (f: any) => (f.published ? <Badge tone="good">Published</Badge> : <Badge>Hidden</Badge>) }, { head: '', cell: (f: any) => <button aria-label="Delete" className="text-red-600" onClick={(ev) => { ev.stopPropagation(); rm.mutate(f._id); }}><Trash2 className="h-4 w-4" /></button> }]} />
      <Modal open={!!e} onClose={() => setE(null)} title="FAQ">{e && <div className="space-y-4"><Field label="Question"><Input value={e.question} onChange={(x) => setE({ ...e, question: x.target.value })} /></Field><Field label="Answer"><Textarea rows={5} value={e.answer} onChange={(x) => setE({ ...e, answer: x.target.value })} /></Field><Field label="Sort order"><Input inputMode="numeric" value={e.sortOrder ?? 0} onChange={(x) => setE({ ...e, sortOrder: x.target.value })} /></Field><Toggle label="Published" checked={e.published !== false} onChange={(v) => setE({ ...e, published: v })} /><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setE(null)}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate(e)}>Save</Button></div></div>}</Modal>
    </div>
  );
}
void Link; void dateTime;
