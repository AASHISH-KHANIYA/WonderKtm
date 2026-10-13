import { Router } from 'express';
import { Category, PolicyVersion, Product } from '../models/index.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/helpers.js';

export const seoRouter = Router();
const x = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

seoRouter.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(['User-agent: *', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /account', 'Disallow: /checkout', 'Disallow: /track', 'Disallow: /order/', `Sitemap: ${env.CLIENT_URL}/sitemap.xml`, ''].join('\n'));
});

seoRouter.get('/sitemap.xml', asyncHandler(async (_req, res) => {
  const base = env.CLIENT_URL.replace(/\/$/, '');
  const [products, cats, pols] = await Promise.all([
    Product.find({ status: 'published' }).select('slug updatedAt').limit(45000).lean(),
    Category.find({ isActive: true }).select('slug updatedAt').lean(),
    PolicyVersion.find({ status: 'published' }).select('slug updatedAt').lean(),
  ]);
  const urls = [
    ...['', '/shop', '/about', '/contact', '/faq'].map((p) => ({ loc: base + p })),
    ...cats.map((c: any) => ({ loc: `${base}/category/${c.slug}`, lastmod: c.updatedAt })),
    ...products.map((p: any) => ({ loc: `${base}/product/${p.slug}`, lastmod: p.updatedAt })),
    ...pols.map((p: any) => ({ loc: `${base}/policies/${p.slug}`, lastmod: p.updatedAt })),
  ];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u: any) => `<url><loc>${x(u.loc)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : ''}</url>`).join('')}</urlset>`);
}));
