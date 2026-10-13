import { Router } from 'express';
import { Category, FAQ, Order, PolicyVersion, Product, StoreSettings, Wishlist, WebsiteContent } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { limiter, validate } from '../middleware/common.js';
import { upload } from '../middleware/upload.js';
import { AppError, notFound } from '../utils/errors.js';
import { asyncHandler, escapeRegex, pageParams, paginated, safeEqual, sha256 } from '../utils/helpers.js';
import { cancelOrder, createOrder, priceCart, trackingTokenFor, trackingUrl, recordHistory } from '../services/orders.js';
import { getSettings } from '../services/settings.js';
import { submitEvidence } from '../services/payments.js';
import { customerOrderView, publicProduct } from '../services/views.js';
import { canMoveFulfilment } from '../services/stateMachine.js';
import { checkoutSchema, evidenceBodySchema, quoteSchema, trackSchema } from '../validators/schemas.js';

export const publicRouter = Router();

const prodSelect = '-variants.reserved -reserved';

// ---------- site config & content ----------
publicRouter.get('/site', asyncHandler(async (_req, res) => {
  const s = await getSettings();
  const [announcement, footer, contact] = await Promise.all(['announcement', 'footer', 'contact'].map((k) => WebsiteContent.findOne({ key: k }).lean()));
  res.json({
    business: s.business, currencies: s.currencies, countries: s.countries, maintenanceMode: s.maintenanceMode, maintenanceMessage: s.maintenanceMessage,
    seoDefaults: s.seoDefaults, theme: s.theme, tax: s.tax, announcement: (announcement as any)?.published ?? null, footer: (footer as any)?.published ?? null, contact: (contact as any)?.published ?? null,
  });
}));

publicRouter.get('/content/:key', asyncHandler(async (req, res) => {
  const doc: any = await WebsiteContent.findOne({ key: req.params.key }).lean();
  const preview = req.query.preview === '1' && req.user && req.user.role !== 'customer';
  res.json({ content: doc ? (preview ? doc.draft : doc.publishedAt ? doc.published : null) : null });
}));

publicRouter.get('/faqs', asyncHandler(async (_req, res) => res.json({ items: await FAQ.find({ published: true }).sort({ sortOrder: 1 }).lean() })));

publicRouter.get('/policies', asyncHandler(async (_req, res) => {
  const items = await PolicyVersion.find({ status: 'published' }).select('slug title effectiveDate version updatedAt').sort({ title: 1 }).lean();
  res.json({ items });
}));
publicRouter.get('/policies/:slug', asyncHandler(async (req, res) => {
  const p = await PolicyVersion.findOne({ slug: req.params.slug, status: 'published' }).sort({ version: -1 }).lean();
  if (!p) throw notFound('This page is not published yet.');
  res.json({ policy: p });
}));

// ---------- categories ----------
publicRouter.get('/categories', asyncHandler(async (_req, res) => {
  const cats = await Category.find({ isActive: true, archivedAt: null }).sort({ sortOrder: 1, name: 1 }).lean();
  const counts = await Product.aggregate([{ $match: { status: 'published' } }, { $group: { _id: '$category', n: { $sum: 1 } } }]);
  const cm = new Map(counts.map((c: any) => [String(c._id), c.n]));
  res.json({ items: cats.map((c: any) => ({ id: String(c._id), name: c.name, slug: c.slug, parent: c.parent ? String(c.parent) : null, description: c.description, image: c.image, banner: c.banner, showOnHome: c.showOnHome, seo: c.seo, productCount: cm.get(String(c._id)) ?? 0 })) });
}));

// ---------- products ----------
async function categoryIdsForSlug(slug: string) {
  const c: any = await Category.findOne({ slug, isActive: true }).lean();
  if (!c) return null;
  const kids = await Category.find({ parent: c._id, isActive: true }).select('_id').lean();
  return { category: c, ids: [c._id, ...kids.map((k: any) => k._id)] };
}

publicRouter.get('/products', asyncHandler(async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, skip } = pageParams(q, 12, 48);
  const filter: any = { status: 'published' };
  let category: any = null;
  if (q.category) {
    const r = await categoryIdsForSlug(String(q.category));
    if (!r) return res.json({ ...paginated([], 0, page, limit), category: null });
    category = r.category;
    filter.$or = [{ category: { $in: r.ids } }, { subcategory: { $in: r.ids } }];
  }
  if (q.q) {
    const rx = new RegExp(escapeRegex(String(q.q).slice(0, 60)), 'i');
    const search = [{ name: rx }, { tags: rx }, { shortDescription: rx }, { sku: rx }];
    filter.$and = [...(filter.$and ?? []), { $or: search }];
  }
  if (q.collection) filter.collections = String(q.collection);
  if (q.featured === '1') filter.isFeatured = true;
  if (q.isNew === '1') filter.isNewArrival = true;
  if (q.onSale === '1') filter.salePrice = { $ne: null };
  const min = Number(q.minPrice), max = Number(q.maxPrice);
  if (Number.isFinite(min) || Number.isFinite(max)) filter.price = { ...(Number.isFinite(min) && q.minPrice ? { $gte: min } : {}), ...(Number.isFinite(max) && q.maxPrice ? { $lte: max } : {}) };
  if (q.inStock === '1') filter.$and = [...(filter.$and ?? []), { $or: [{ stock: { $gt: 0 } }, { variants: { $elemMatch: { stock: { $gt: 0 }, active: true } } }] }];
  const sorts: Record<string, any> = { newest: { createdAt: -1 }, price_asc: { price: 1 }, price_desc: { price: -1 }, popular: { soldCount: -1, createdAt: -1 }, featured: { isFeatured: -1, createdAt: -1 } };
  const sort = sorts[q.sort] ?? sorts.featured;
  const [items, total] = await Promise.all([
    Product.find(filter).select(prodSelect).sort(sort).skip(skip).limit(limit).populate('category', 'name slug').lean(),
    Product.countDocuments(filter),
  ]);
  res.json({ ...paginated(items.map((p) => publicProduct(p)), total, page, limit), category: category ? { id: String(category._id), name: category.name, slug: category.slug, description: category.description, banner: category.banner, seo: category.seo } : null });
}));

publicRouter.get('/search/suggest', asyncHandler(async (req, res) => {
  const term = String(req.query.q ?? '').trim().slice(0, 40);
  if (term.length < 2) return res.json({ products: [], categories: [] });
  const rx = new RegExp(escapeRegex(term), 'i');
  const [products, categories] = await Promise.all([
    Product.find({ status: 'published', $or: [{ name: rx }, { tags: rx }] }).select('name slug images price salePrice').limit(6).lean(),
    Category.find({ isActive: true, name: rx }).select('name slug').limit(4).lean(),
  ]);
  res.json({ products: products.map((p: any) => ({ name: p.name, slug: p.slug, image: p.images?.[0]?.url, price: p.salePrice ?? p.price })), categories });
}));

publicRouter.get('/products/:slug', asyncHandler(async (req, res) => {
  const p: any = await Product.findOne({ slug: req.params.slug, status: 'published' }).select(prodSelect).populate('category', 'name slug').populate('subcategory', 'name slug').lean();
  if (!p) {
    const old: any = await Product.findOne({ slugHistory: req.params.slug, status: 'published' }).select('slug').lean();
    if (old) return res.status(301).json({ redirectTo: old.slug });
    throw notFound('This product could not be found.');
  }
  const catIds = [p.category?._id, p.subcategory?._id].filter(Boolean);
  const related = await Product.find({ status: 'published', _id: { $ne: p._id }, $or: [{ category: { $in: catIds } }, { subcategory: { $in: catIds } }] }).select(prodSelect).sort({ soldCount: -1 }).limit(4).populate('category', 'name slug').lean();
  res.json({ product: publicProduct(p), related: related.map((r) => publicProduct(r)) });
}));

// ---------- cart quote / checkout ----------
publicRouter.post('/cart/quote', limiter(5, 120), validate(quoteSchema), asyncHandler(async (req, res) => {
  const r = await priceCart(req.body, { userId: req.user?._id });
  res.json({
    currency: r.currency,
    lines: r.lines.map(({ _categoryIds, categoryId, ...l }: any) => ({ ...l, productId: String(l.productId), variantId: l.variantId ? String(l.variantId) : undefined })),
    totals: r.totals, coupon: r.coupon ? { code: r.coupon.code, discount: r.coupon.discount, freeShipping: r.coupon.freeShipping } : null, couponError: r.couponError,
    shipping: r.shipping, shippingError: r.shippingError,
    paymentMethods: r.paymentMethods.map((m: any) => ({ key: m.key, label: m.label, type: m.type, currency: m.currency })),
  });
}));

publicRouter.post('/orders', limiter(15, 20), validate(checkoutSchema), asyncHandler(async (req, res) => {
  const key = req.header('idempotency-key')?.slice(0, 100);
  const { order, duplicate } = await createOrder(req.body, { userId: req.user?._id, idempotencyKey: key });
  res.status(duplicate ? 200 : 201).json({ orderNumber: order.orderNumber, total: order.total, currency: order.currency, trackingToken: trackingTokenFor(order.orderNumber), trackingUrl: trackingUrl(order.orderNumber), duplicate });
}));

// ---------- guest / token order access ----------
async function orderByToken(orderNumber: string, token: string) {
  const o: any = await Order.findOne({ orderNumber }).select('+trackingTokenHash');
  // Same error for "no such order" and "wrong token" so order numbers cannot be probed.
  if (!o || !safeEqual(o.trackingTokenHash ?? '', sha256(token))) throw notFound('We could not find an order with those details.');
  return o;
}
const trackLimiter = limiter(15, 30);

publicRouter.post('/orders/track', trackLimiter, validate(trackSchema), asyncHandler(async (req, res) => {
  const o = await orderByToken(req.body.orderNumber, req.body.token);
  res.json({ order: await customerOrderView(o) });
}));

publicRouter.post('/orders/track/evidence', trackLimiter, upload.single('file'), asyncHandler(async (req, res) => {
  const t = trackSchema.parse({ orderNumber: req.body.orderNumber, token: req.body.token });
  const body = evidenceBodySchema.parse({ transactionRef: req.body.transactionRef || undefined, payerNote: req.body.payerNote || undefined });
  const o = await orderByToken(t.orderNumber, t.token);
  await submitEvidence(o, req.file, body, { type: 'customer', id: o.user });
  res.json({ order: await customerOrderView(await Order.findById(o._id)) });
}));

publicRouter.post('/orders/track/cancel', trackLimiter, validate(trackSchema), asyncHandler(async (req, res) => {
  const o = await orderByToken(req.body.orderNumber, req.body.token);
  await customerCancel(o);
  res.json({ order: await customerOrderView(await Order.findById(o._id)) });
}));

async function customerCancel(o: any) {
  if (o.paymentStatus !== 'paid' && o.fulfilmentStatus === 'awaiting_payment_verification') return cancelOrder(o, { type: 'customer', id: o.user }, 'Cancelled by customer');
  const c = canMoveFulfilment({ ...o.toObject(), paymentType: 'qr' }, 'cancellation_requested');
  if (!c.ok) throw new AppError(409, 'This order can no longer be cancelled online. Please contact us.', 'CANNOT_CANCEL');
  await Order.updateOne({ _id: o._id }, { $set: { fulfilmentStatus: 'cancellation_requested' } });
  await recordHistory(o, 'fulfilment', o.fulfilmentStatus, 'cancellation_requested', { type: 'customer', id: o.user }, 'Customer requested cancellation');
}

// ---------- signed-in customer ----------
publicRouter.get('/me/orders', requireAuth, asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query as any, 10, 50);
  const filter = { $or: [{ user: req.user!._id }] };
  const [items, total] = await Promise.all([Order.find(filter).sort({ placedAt: -1 }).skip(skip).limit(limit).select('orderNumber placedAt total currency paymentStatus fulfilmentStatus items.name items.image items.quantity').lean(), Order.countDocuments(filter)]);
  res.json(paginated(items, total, page, limit));
}));
async function myOrder(req: any) {
  const o: any = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!o) throw notFound('Order not found.'); // 404, not 403: do not confirm other customers' order ids exist
  return o;
}
publicRouter.get('/me/orders/:id', requireAuth, asyncHandler(async (req, res) => {
  const o = await myOrder(req);
  res.json({ order: await customerOrderView(o), trackingUrl: trackingUrl(o.orderNumber) });
}));
publicRouter.post('/me/orders/:id/evidence', requireAuth, upload.single('file'), asyncHandler(async (req, res) => {
  const o = await myOrder(req);
  const body = evidenceBodySchema.parse({ transactionRef: req.body.transactionRef || undefined, payerNote: req.body.payerNote || undefined });
  await submitEvidence(o, req.file, body, { type: 'customer', id: req.user!._id });
  res.json({ order: await customerOrderView(await Order.findById(o._id)) });
}));
publicRouter.post('/me/orders/:id/cancel', requireAuth, asyncHandler(async (req, res) => {
  const o = await myOrder(req);
  await customerCancel(o);
  res.json({ order: await customerOrderView(await Order.findById(o._id)) });
}));

// ---------- wishlist ----------
publicRouter.get('/wishlist', requireAuth, asyncHandler(async (req, res) => {
  const w: any = await Wishlist.findOne({ user: req.user!._id }).populate({ path: 'products', match: { status: 'published' }, select: prodSelect, populate: { path: 'category', select: 'name slug' } }).lean();
  res.json({ items: (w?.products ?? []).map((p: any) => publicProduct(p)) });
}));
publicRouter.post('/wishlist/:productId', requireAuth, asyncHandler(async (req, res) => {
  if (!(await Product.exists({ _id: req.params.productId, status: 'published' }))) throw notFound('Product not found.');
  await Wishlist.updateOne({ user: req.user!._id }, { $addToSet: { products: req.params.productId } }, { upsert: true });
  res.json({ ok: true });
}));
publicRouter.delete('/wishlist/:productId', requireAuth, asyncHandler(async (req, res) => {
  await Wishlist.updateOne({ user: req.user!._id }, { $pull: { products: req.params.productId } });
  res.json({ ok: true });
}));

void StoreSettings;
