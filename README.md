# Wonderktm — premium home décor & gifting e-commerce platform

*Discover Delight Repeat.* · Devkota Marg, Dillibazar, Kathmandu, Nepal

A full-stack store: React + TypeScript storefront, Express + TypeScript API, MongoDB Atlas (Mongoose), secure sessions, guest + account checkout, **manual QR payments (eSewa / Khalti / optional UPI) with staff verification**, inventory, and a role-based admin portal.

> **Honest status.** Everything below is implemented and the server logic is covered by 86 automated tests. Real-world operation still depends on accounts only you can create: a MongoDB Atlas cluster, image storage (Cloudinary), optional SMTP email, and your **official eSewa/Khalti/UPI QR images**. See [Known limitations](#20-known-limitations--outstanding-configuration).

## 1–2. Overview & features
* **Storefront:** announcement bar, hero, featured categories, new arrivals, best sellers, offers, collections, About, trust points; shop with search/suggestions, category + subcategory, price/availability filters, sorting, pagination; product pages with gallery, variants (own price/stock), delivery/payment/return info, related products; cart with server-side pricing, coupons, shipping; wishlist; guest checkout; accounts, saved addresses, order history, order tracking; FAQ, Contact, About, 8 editable policy pages, custom 404.
* **Payments:** per-method QR + instructions, exact amount and currency, screenshot upload (JPG/PNG/WebP, size-limited, magic-byte checked, **private storage**), staff approve/reject with required reason, resubmission, duplicate-decision protection. *Uploading a screenshot never marks an order paid.*
* **Orders:** separate payment and fulfilment statuses, validated transitions, history + audit trail, cancellations (stock/coupon released once), returns, refund status tracking, COD (explicit "cash collected"), idempotent checkout, auto-expiry of unpaid reservations.
* **Admin (`/admin`):** live dashboard (per-currency; verified receipts vs unverified value), payment verification queue, orders, customers (+ internal notes), products (variants, images, scheduled sales, SEO, duplicate, safe archive), categories, inventory + movement log, coupons, shipping zones, homepage/pages (draft → publish), versioned policies (owner review required), FAQs, settings (business, payment methods, brand colours, tax, maintenance), staff roles, audit log, CSV exports.
* **Roles:** Owner · Order & Payment Manager · Product & Inventory Manager · Content Manager. Public registration can only ever create customers.

## 3. Architecture
```
client/  React 18 + Vite + Tailwind + React Router + TanStack Query + React Hook Form/Zod
server/  Express 4 + Mongoose 8 + Zod; services/ hold the business rules (pricing, coupons, shipping, state machine, inventory, payments)
scripts/ package-zip.mjs        docs/ DATA_MODEL.md
```
The browser never calculates money: `/api/cart/quote` and `POST /api/orders` share one server-side pricing function. See [docs/DATA_MODEL.md](docs/DATA_MODEL.md) for schema decisions.
UI primitives are hand-written in shadcn/ui style (Tailwind + accessible dialogs); the shadcn CLI is not required.

## 4. Prerequisites
Node.js ≥ 20, npm ≥ 10, a MongoDB Atlas account (free M0 works), optionally Cloudinary and an SMTP provider.

## 5. Installation
```bash
npm install                      # installs client + server workspaces
cp .env.example server/.env      # then edit server/.env
```

## 6–9. MongoDB Atlas setup
1. Create a free cluster at <https://cloud.mongodb.com>.
2. **Database user:** *Database Access → Add New Database User* → password auth → role **Read and write to any database** (or scope to the `wonderktm` database). Use a long generated password.
3. **Network access:** *Network Access → Add IP Address*. For development add **your current IP**. For production add only your hosting provider's egress IPs. **Avoid `0.0.0.0/0`** unless your host has no fixed IPs and you rely on a strong password + TLS.
4. **Connection string:** *Connect → Drivers* → copy the `mongodb+srv://…` URI, insert your password (URL-encode special characters) and a database name:
   `MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/wonderktm?retryWrites=true&w=majority`
5. Put it **only** in `server/.env` (git-ignored). Never paste it into chats, tickets, or frontend code. If it has been exposed anywhere, rotate the password in *Database Access*.

## 10. Authentication secrets
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # → JWT_SECRET
```
Sessions are JWTs in an **HTTP-only, SameSite=Lax, Secure (in production)** cookie, 12 h with sliding renewal; roles are re-read from the database on every request; password change/reset/disable invalidates old sessions. State-changing requests must carry `X-Requested-With: wonderktm` (CSRF defence in depth).

## 11. Image storage
* `STORAGE_DRIVER=local` — development only (files in `server/uploads-public` and `server/uploads-private`).
* `STORAGE_DRIVER=mongo` — images are stored in MongoDB (`fileblobs` collection) and served from `/api/files/:id` with long cache headers. Works on Vercel with no extra service; best for a small catalogue of modest-sized images (Vercel caps uploads at ~4.5 MB, Atlas free tier at 512 MB). Payment evidence is stored as private and only streamed to staff.
* `STORAGE_DRIVER=cloudinary` + `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` — production. Product/QR images are uploaded as public assets; **payment evidence is uploaded as `authenticated` assets and is only streamed to authorised staff through the API** (no public URL). If credentials are missing, uploads fail with a clear message and *Admin → Settings → System status* shows it.

## 12. eSewa, Khalti and UPI QR images
*Admin → Settings → Payment methods* → pick a method → upload the **official QR exactly as issued**, add instructions and merchant/account text → switch **Active**. Methods are seeded **inactive**; a QR method cannot be activated without a QR. **UPI (INR/India):** only enable it after confirming your business can legally receive and settle INR payments; the admin must tick an explicit acknowledgement. Also enable INR/India under *Settings → Markets*, add an INR price to products, and add a shipping zone for India.

## 13. Initial administrator
```bash
# in server/.env set OWNER_EMAIL, OWNER_PASSWORD (10+ chars, letters+digits), OWNER_NAME
npm run create-owner
# then delete OWNER_PASSWORD from server/.env
```
Runs once (refuses if an owner exists). The owner then adds other staff in *Admin → Staff & roles*.

## 14. Seeding
```bash
npm run seed                 # categories, settings, 2 shipping zones, content, policy DRAFTS, FAQs
npm run seed -- --demo       # adds clearly-labelled DEMO products (SKU "DEMO-…") — delete before launch
```
Seed data never creates orders, payments or customers.

## 15. Development
```bash
npm run dev     # API on :4000, client on :5173 (Vite proxies /api and /uploads)
```
## 16. Tests
```bash
npm test        # vitest: 35 unit tests + 51 API integration tests
```
Integration tests need a MongoDB-compatible server (`TEST_MONGODB_URI`, default `mongodb://127.0.0.1:27017/wonderktm_test`) and **drop that database** — never point it at production. They are skipped if no server is reachable. Concurrency tests run truly in parallel on real MongoDB. See *Known limitations* for what was actually run.

## 17. Production build
```bash
npm run build && NODE_ENV=production npm start   # API also serves client/dist and /sitemap.xml
```
## 18. Deployment
See [DEPLOYMENT.md](DEPLOYMENT.md).

## 19. Environment variables
| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Atlas connection string (secret) |
| `JWT_SECRET` | ≥ 32 chars; signs sessions and derives guest tracking tokens (secret) |
| `CLIENT_URL` | Public site URL(s), comma separated; used for CORS, emails, sitemap |
| `PORT`, `NODE_ENV`, `JWT_EXPIRES_IN`, `COOKIE_DOMAIN` | Server basics |
| `STORAGE_DRIVER`, `CLOUDINARY_*`, `MAX_UPLOAD_MB` | File storage |
| `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM`, `ADMIN_NOTIFY_EMAIL` | Email (optional) |
| `OWNER_EMAIL/PASSWORD/NAME` | One-time owner creation |

## 20. Known limitations & outstanding configuration
* **Not yet connected (needs your accounts):** Atlas, Cloudinary, SMTP, official QR images, business email/phone/social links, logo. Until SMTP is set, emails are recorded as `skipped_not_configured` (never reported as sent).
* **Policies are drafts** with `[PLACEHOLDERS]`; the owner must complete, review and publish them (Terms must be published before launch; the accepted Terms version is stored on each order). They are not legal advice.
* **Payments are manual by design.** No gateway API is integrated or simulated. The backend is structured (`PaymentAttempt`, `approvePayment`) so a documented gateway can be added later.
* **Phone OTP and social login are not included** — decide first; they involve paid third parties.
* International shipping/payment are off until you add zones/methods and enable markets. No currency conversion is ever performed.
* Search is regex-based (fine for a small catalogue); consider Atlas Search for large catalogues.
* No automated browser/e2e tests, no visual regression tests, no image resizing pipeline (Cloudinary transforms apply when using Cloudinary).
* **What was verified in the build environment:** server type-check and compile, client type-check and production build, 86 tests (35 unit + 51 API), and a live smoke run of the built API. The API tests ran against **FerretDB (a MongoDB-compatible engine on SQLite), not real MongoDB/Atlas**, because the sandbox could not download MongoDB. FerretDB does not provide atomic conditional updates under parallel writes, so the concurrency tests (oversell, coupon limit, double approval) ran *sequentially* there; dashboard money sums are verified by unit tests of the shared math rather than by the aggregation. **Run `npm test` against a real MongoDB (or an Atlas test database) before launch.** The UI was type-checked and built but not exercised in a real browser here, and Cloudinary / SMTP paths were not exercised (no credentials).
