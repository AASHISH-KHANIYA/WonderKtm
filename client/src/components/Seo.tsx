import { useEffect } from 'react';
import { useSite } from '@/context/SiteContext';

function setMeta(attr: 'name' | 'property', key: string, value?: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!value) { el?.remove(); return; }
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.content = value;
}

export function Seo({ title, description, image, path, noindex, jsonLd }: { title?: string; description?: string; image?: string; path?: string; noindex?: boolean; jsonLd?: object }) {
  const { site } = useSite();
  useEffect(() => {
    const brand = site?.business.name ?? 'Wonderktm';
    const t = title ? `${title} | ${brand}` : site?.seoDefaults.title ?? brand;
    const d = description ?? site?.seoDefaults.description ?? '';
    const url = `${window.location.origin}${path ?? window.location.pathname}`;
    document.title = t;
    setMeta('name', 'description', d);
    setMeta('name', 'robots', noindex ? 'noindex,nofollow' : undefined);
    setMeta('property', 'og:title', t); setMeta('property', 'og:description', d); setMeta('property', 'og:type', 'website'); setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', image ? new URL(image, window.location.origin).href : site?.seoDefaults.ogImage);
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = url;
    let ld = document.getElementById('ld-json');
    if (jsonLd) { if (!ld) { ld = document.createElement('script'); ld.id = 'ld-json'; (ld as HTMLScriptElement).type = 'application/ld+json'; document.head.appendChild(ld); } ld.textContent = JSON.stringify(jsonLd); } else ld?.remove();
    return () => { document.getElementById('ld-json')?.remove(); };
  }, [title, description, image, path, noindex, site, jsonLd]);
  return null;
}
