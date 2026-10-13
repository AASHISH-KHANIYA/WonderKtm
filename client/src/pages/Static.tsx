import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useSite } from '@/context/SiteContext';
import { Seo } from '@/components/Seo';
import { Alert, Field, Input, PageLoader, Textarea, Button } from '@/components/ui';
import { date } from '@/utils/format';

/** Minimal, safe markdown renderer: headings, lists, bold/italic, links. HTML is never injected (everything is React text nodes). */
function inline(s: string) {
  const out: React.ReactNode[] = []; const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((?:https?:\/\/|\/)[^)\s]+\))/g; let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index)); const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>); else if (t.startsWith('*')) out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    else { const [, text, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!; out.push(href.startsWith('/') ? <Link key={k++} to={href} className="font-semibold text-brand underline">{text}</Link> : <a key={k++} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">{text}</a>); }
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last)); return out;
}
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []; let list: string[] = []; let k = 0;
  const flush = () => { if (list.length) { blocks.push(<ul key={k++}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = []; } };
  for (const line of text.split('\n')) {
    if (/^\s*[-*]\s+/.test(line)) { list.push(line.replace(/^\s*[-*]\s+/, '')); continue; } flush();
    if (line.startsWith('## ')) blocks.push(<h2 key={k++}>{inline(line.slice(3))}</h2>); else if (line.startsWith('# ')) blocks.push(<h1 key={k++}>{inline(line.slice(2))}</h1>); else if (line.trim()) blocks.push(<p key={k++}>{inline(line)}</p>);
  }
  flush(); return <div className="prose-wk">{blocks}</div>;
}

export function Policy() {
  const { slug } = useParams();
  const q = useQuery({ queryKey: ['policy', slug], queryFn: () => api.get<{ policy: { title: string; body: string; effectiveDate?: string; updatedAt: string; version: number } }>(`/policies/${slug}`), retry: false });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <div className="container-x py-24 text-center"><Seo title="Page not available" noindex /><h1 className="text-5xl">Not published yet</h1><p className="mt-2 text-muted">This page will be available soon.</p><Link to="/" className="btn-primary mt-6">Back home</Link></div>;
  const p = q.data!.policy;
  return <div className="container-x max-w-3xl py-12"><Seo title={p.title} /><Markdown text={p.body} /><p className="mt-8 border-t border-line pt-4 text-xs text-muted">Version {p.version} · Effective {date(p.effectiveDate)} · Last updated {date(p.updatedAt)}</p></div>;
}

export function About() {
  const q = useQuery({ queryKey: ['content', 'about'], queryFn: () => api.get<{ content: { title?: string; body?: string; image?: string } | null }>('/content/about') });
  const { site } = useSite(); const c = q.data?.content;
  return <div className="container-x max-w-3xl py-12"><Seo title="About us" description={c?.body?.slice(0, 160)} /><h1 className="text-5xl">{c?.title || `About ${site?.business.name ?? ''}`}</h1>{c?.image && <img src={c.image} alt="" className="mt-6 w-full rounded-xl2" />}<p className="prose-wk mt-6 whitespace-pre-line">{c?.body || 'Our story is coming soon.'}</p><p className="mt-6 text-sm text-muted">{site?.business.address}</p></div>;
}

export function Contact() {
  const { site } = useSite(); const c = site?.contact ?? {}; const b = site?.business;
  const email = c.email || b?.email, phone = c.phone || b?.phone;
  return (
    <div className="container-x max-w-3xl py-12"><Seo title="Contact us" /><h1 className="text-5xl">Contact us</h1>
      <div className="card mt-8 space-y-3 p-6 text-sm"><p><b>Address:</b> {c.address || b?.address}</p><p><b>Hours:</b> {c.hours || b?.hours}</p>
        {email ? <p><b>Email:</b> <a className="text-brand underline" href={`mailto:${email}`}>{email}</a></p> : null}{phone ? <p><b>Phone:</b> <a className="text-brand underline" href={`tel:${phone}`}>{phone}</a></p> : null}
        {b?.whatsapp ? <p><b>WhatsApp:</b> <a className="text-brand underline" href={`https://wa.me/${b.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">{b.whatsapp}</a></p> : null}
        {!email && !phone && <Alert tone="info">Email and phone details will be added soon. For now, you can visit or write to our address above.</Alert>}</div>
      {email && <form className="card mt-6 space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); const d = new FormData(e.currentTarget); location.href = `mailto:${email}?subject=${encodeURIComponent(String(d.get('subject')))}&body=${encodeURIComponent(String(d.get('message')))}`; }}>
        <h2 className="text-2xl">Send us a message</h2><Field label="Subject"><Input name="subject" required maxLength={120} /></Field><Field label="Message"><Textarea name="message" required rows={5} maxLength={2000} /></Field><Button type="submit">Open in email app</Button></form>}
    </div>
  );
}

export function Faq() {
  const q = useQuery({ queryKey: ['faqs'], queryFn: () => api.get<{ items: { _id: string; question: string; answer: string }[] }>('/faqs') });
  return <div className="container-x max-w-3xl py-12"><Seo title="Frequently asked questions" /><h1 className="text-5xl">FAQ</h1><div className="mt-8 space-y-3">{q.isLoading ? <PageLoader /> : q.data!.items.length === 0 ? <p className="text-muted">No questions yet.</p> : q.data!.items.map((f) => <details key={f._id} className="card group p-5"><summary className="cursor-pointer list-none font-semibold text-navy marker:hidden">{f.question}</summary><p className="prose-wk mt-3 whitespace-pre-line">{f.answer}</p></details>)}</div></div>;
}

export function ShippingInfo() {
  const q = useQuery({ queryKey: ['content', 'shipping-info'], queryFn: () => api.get<{ content: { text?: string } | null }>('/content/shipping-info') });
  return <div className="container-x max-w-3xl py-12"><Seo title="Shipping & delivery" /><h1 className="text-5xl">Shipping &amp; delivery</h1><p className="prose-wk mt-6 whitespace-pre-line">{q.data?.content?.text || 'Delivery charges and estimated times are shown at checkout for your address.'}</p><Link to="/policies/shipping" className="mt-4 inline-block text-sm font-semibold text-brand underline">Read the full shipping policy</Link></div>;
}

export const NotFound = () => <div className="container-x py-28 text-center"><Seo title="Page not found" noindex /><p className="font-display text-8xl text-gold">404</p><h1 className="mt-2 text-4xl">We can’t find that page</h1><p className="mt-2 text-muted">The page may have moved or never existed.</p><div className="mt-6 flex justify-center gap-3"><Link to="/" className="btn-primary">Go home</Link><Link to="/shop" className="btn-outline">Browse the shop</Link></div></div>;
