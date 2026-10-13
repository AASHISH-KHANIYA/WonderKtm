# Deployment

The server serves the built client, so a single Node service is enough (Render, Railway, Fly.io, a VPS, etc.).

1. **Atlas:** production cluster, dedicated DB user, IP allow-list limited to your host (see README §6–9).
2. **Environment** (set in the host's secret manager, never in git):
   `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET` (48+ random bytes), `CLIENT_URL=https://your-domain`, `STORAGE_DRIVER=cloudinary` + `CLOUDINARY_*`, SMTP vars, `ADMIN_NOTIFY_EMAIL`.
3. **Build & start:** `npm ci && npm run build` then `npm start` (listens on `PORT`). Health check: `GET /api/health`.
4. **HTTPS is required** (cookies are `Secure` in production). If behind a proxy/load balancer it must forward `X-Forwarded-*`; the app sets `trust proxy` to 1.
5. **First run:** `npm run create-owner`, then `npm run seed` (skip `--demo`). Sign in at `/login` → `/admin`; upload logo, QR images; review & publish the Terms and other policies; add shipping zones; set business email/phone.
6. **Split hosting (optional):** host `client/dist` on a CDN and set `CLIENT_URL` to that origin; the client must then reach the API under `/api` on the same site (reverse proxy) so cookies stay first-party.
7. **Backups & hygiene:** enable Atlas backups; rotate secrets after any exposure; keep `server/uploads-*` out of production (use Cloudinary); review the *Audit log* periodically.
8. **Before launch checklist:** run `npm test` against a real test database · activate at least one payment method with its QR · publish Terms/Privacy · confirm SMTP delivers · place a test order end-to-end and approve it · delete demo products.
