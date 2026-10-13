import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env, isProd } from './config/env.js';
import { csrfGuard, loadUser, requireStaff } from './middleware/auth.js';
import { errorHandler, limiter, notFoundHandler, sanitizeMongo } from './middleware/common.js';
import { adminCatalogRouter } from './routes/adminCatalog.js';
import { adminOrdersRouter } from './routes/adminOrders.js';
import { adminReportsRouter } from './routes/adminReports.js';
import { adminStoreRouter } from './routes/adminStore.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { seoRouter } from './routes/seo.js';
import { readPublicMongo } from './services/storage.js';

export function createApp() {
  const app = express();
  if (isProd) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'], scriptSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use(cors({ origin: env.CLIENT_URL.split(',').map((s) => s.trim()), credentials: true, allowedHeaders: ['Content-Type', 'X-Requested-With', 'Idempotency-Key'] }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(sanitizeMongo);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use(seoRouter);
  // Only the *public* upload folder is exposed. Private payment evidence lives elsewhere and is served solely through authorised routes.
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads-public'), { maxAge: '7d', index: false, dotfiles: 'deny' }));
  // Public images stored in MongoDB. Ids are never reused, so browsers and Vercel's CDN may cache them for a year.
  app.get('/api/files/:id', async (req, res, next) => {
    try {
      const f = await readPublicMongo(req.params.id);
      if (!f) return res.status(404).json({ message: 'Image not found.' });
      res.set({ 'Content-Type': f.mime, 'Content-Length': String(f.data.length), 'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable' });
      res.end(f.data);
    } catch (e) { next(e); }
  });

  app.use('/api', limiter(1, 300), loadUser, csrfGuard);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', requireStaff, adminCatalogRouter);
  app.use('/api/admin', requireStaff, adminOrdersRouter);
  app.use('/api/admin', requireStaff, adminStoreRouter);
  app.use('/api/admin', adminReportsRouter);
  app.use('/api', publicRouter);
  app.use('/api', notFoundHandler);

  const dist = path.resolve(process.cwd(), '../client/dist');
  if (isProd && fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
