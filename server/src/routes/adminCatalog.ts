import { Router } from 'express';
import { z } from 'zod';
import { Category, InventoryMovement, Product } from '../models/index.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/common.js';
import { upload } from '../middleware/upload.js';
import { AppError, badRequest, conflict, notFound } from '../utils/errors.js';
import { asyncHandler, escapeRegex, pageParams, paginated, slugify } from '../utils/helpers.js';
import { audit } from '../services/audit.js';
import { adjustStock } from '../services/inventory.js';
import { getSettings } from '../services/settings.js';
import { putFile, validateImageUpload, deleteFile } from '../services/storage.js';
import { categoryInput, productInput } from '../validators/schemas.js';
import { toCsv } from '../utils/csv.js';

export const adminCatalogRouter = Router();
// Guards are path-scoped so this router never shadows the order/payment/store routers mounted on the same prefix.
adminCatalogRouter.use(['/categories', '/products', '/inventory'], requireRole('inventory_manager'));
adminCatalogRouter.use('/uploads', requireRole('inventory_manager', 'content_manager'));

// Public images (product photos, category banners, logos, QR codes). Private payment evidence uses a different path entirely.
adminCatalogRouter.post('/uploads/image', upload.single('file'), asyncHandler(async (req, res) => {
  const s = await getSettings();
  const mime = validateImageUpload(req.file, s.maxUploadMb);
  const folder = ['products', 'categories', 'site', 'payment-qr'].includes(String(req.body.folder)) ? String(req.body.folder) : 'site';
  const f = await putFile(req.file!.buffer, mime, { folder, private: false });
  await audit(req, 'upload.image', 'Upload', f.key, { folder });
  res.status(201).json({ url: f.url, publicId: f.key, provider: f.provider });
}));

// ---------- categories ----------
async function uniqueSlug(model: any, base: string, excludeId?: string) {
  let slug = slugify(base), n = 1;
  while (await model.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) slug = `${slugify(base)}-${++n}`;
  return slug;
}

adminCatalogRouter.get('/categories', asyncHandler(async (_req, res) => {
  const cats = await Category.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  const counts = await Product.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }]);
  const cm = new Map(counts.map((c: any) => [String(c._id), c.n]));
  res.json({ items: cats.map((c: any) => ({ ...c, productCount: cm.get(String(c._id)) ?? 0 })) });
}));
adminCatalogRouter.post('/categories', validate(categoryInput), asyncHandler(async (req, res) => {
  const slug = await uniqueSlug(Category, req.body.slug || req.body.name);
  const c = await Category.create({ ...req.body, slug });
  await audit(req, 'category.create', 'Category', c._id);
  res.status(201).json({ category: c });
}));
adminCatalogRouter.put('/categories/:id', validate(categoryInput), asyncHandler(async (req, res) => {
  const cur: any = await Category.findById(req.params.id);
  if (!cur) throw notFound('Category not found.');
  if (req.body.parent && String(req.body.parent) === String(cur._id)) throw badRequest('A category cannot be its own parent.');
  const slug = req.body.slug ? await uniqueSlug(Category, req.body.slug, req.params.id) : cur.slug;
  if (slug !== cur.slug) cur.slugHistory.push(cur.slug);
  cur.set({ ...req.body, slug });
  await cur.save();
  await audit(req, 'category.update', 'Category', cur._id);
  res.json({ category: cur });
}));
adminCatalogRouter.post('/categories/reorder', validate(z.object({ ids: z.array(z.string()).max(200) })), asyncHandler(async (req, res) => {
  await Promise.all((req.body.ids as string[]).map((id, i) => Category.updateOne({ _id: id }, { $set: { sortOrder: i } })));
  res.json({ ok: true });
}));
// Never hard-delete a category that still has products or children: archive instead.
adminCatalogRouter.delete('/categories/:id', asyncHandler(async (req, res) => {
  const [products, children] = await Promise.all([Product.countDocuments({ $or: [{ category: req.params.id }, { subcategory: req.params.id }] }), Category.countDocuments({ parent: req.params.id })]);
  if (products || children) {
    await Category.updateOne({ _id: req.params.id }, { $set: { isActive: false, archivedAt: new Date() } });
    await audit(req, 'category.archive', 'Category', req.params.id);
    return res.json({ archived: true, message: `Archived instead of deleted: it still has ${products} product(s) and ${children} subcategor${children === 1 ? 'y' : 'ies'}.` });
  }
  await Category.deleteOne({ _id: req.params.id });
  await audit(req, 'category.delete', 'Category', req.params.id);
  res.json({ deleted: true });
}));

// ---------- products ----------
function normaliseImages(images?: { url: string; publicId?: string; alt?: string; isPrimary?: boolean }[]) {
  if (!images) return undefined;
  const out = images.map((i, idx) => ({ ...i, isPrimary: false, _o: idx }));
  const primary = images.findIndex((i) => i.isPrimary);
  if (out.length) out[primary >= 0 ? primary : 0].isPrimary = true;
  return out.map(({ _o, ...rest }) => rest);
}

adminCatalogRouter.get('/products', asyncHandler(async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, skip } = pageParams(q, 20, 100);
  const f: any = {};
  if (q.status) f.status = q.status; else f.status = { $ne: 'archived' };
  if (q.category) f.category = q.category;
  if (q.q) { const rx = new RegExp(escapeRegex(q.q.slice(0, 60)), 'i'); f.$or = [{ name: rx }, { sku: rx }, { 'variants.sku': rx }]; }
  if (q.stock === 'out') f.stock = 0;
  const [items, total] = await Promise.all([Product.find(f).sort({ updatedAt: -1 }).skip(skip).limit(limit).populate('category', 'name').lean(), Product.countDocuments(f)]);
  res.json(paginated(items, total, page, limit));
}));
adminCatalogRouter.get('/products/export.csv', asyncHandler(async (req, res) => {
  const rows: any[] = [];
  for (const p of (await Product.find({ status: { $ne: 'archived' } }).limit(5000).lean()) as any[]) {
    if (p.variants?.length) for (const v of p.variants) rows.push({ name: p.name, sku: v.sku, variant: v.name, price: v.price ?? p.price, stock: v.stock, status: p.status });
    else rows.push({ name: p.name, sku: p.sku, variant: '', price: p.price, stock: p.stock, status: p.status });
  }
  await audit(req, 'export.inventory', 'Product', undefined, { count: rows.length });
  res.type('text/csv').attachment('inventory.csv').send(toCsv(rows, ['name', 'sku', 'variant', 'price', 'stock', 'status']));
}));
adminCatalogRouter.get('/products/:id', asyncHandler(async (req, res) => {
  const p = await Product.findById(req.params.id).lean();
  if (!p) throw notFound('Product not found.');
  const movements = await InventoryMovement.find({ product: p._id }).sort({ at: -1 }).limit(50).lean();
  res.json({ product: p, movements });
}));

async function checkSkus(b: any, selfId?: string) {
  const skus: string[] = [b.sku, ...(b.variants ?? []).map((v: any) => v.sku)];
  const clash = await Product.findOne({ ...(selfId ? { _id: { $ne: selfId } } : {}), $or: [{ sku: { $in: skus } }, { 'variants.sku': { $in: skus } }] }).select('name').lean();
  if (clash) throw conflict(`A SKU in this product is already used by "${(clash as any).name}".`, 'SKU_TAKEN');
}

function checkSale(b: any) {
  if (b.salePrice != null && b.salePrice >= b.price) throw badRequest('The sale price must be lower than the regular price.');
  if (b.saleStart && b.saleEnd && b.saleEnd < b.saleStart) throw badRequest('The sale end date must be after the start date.');
  const skus = (b.variants ?? []).map((v: any) => v.sku.toLowerCase());
  if (new Set(skus).size !== skus.length) throw badRequest('Variant SKUs must be unique.');
}

adminCatalogRouter.post('/products', validate(productInput), asyncHandler(async (req, res) => {
  const b = req.body;
  checkSale(b);
  await checkSkus(b);
  const slug = await uniqueSlug(Product, b.slug || b.name);
  const p = await Product.create({ ...b, slug, images: normaliseImages(b.images), publishedAt: b.status === 'published' ? new Date() : undefined });
  const total = p.variants.length ? p.variants.reduce((s, v) => s + v.stock, 0) : p.stock;
  if (total > 0) await InventoryMovement.create({ product: p._id, delta: total, reason: 'initial', by: req.user!._id, balanceAfter: total, sku: p.sku });
  await audit(req, 'product.create', 'Product', p._id);
  res.status(201).json({ product: p });
}));

adminCatalogRouter.put('/products/:id', validate(productInput), asyncHandler(async (req, res) => {
  const cur: any = await Product.findById(req.params.id);
  if (!cur) throw notFound('Product not found.');
  const b = req.body;
  checkSale(b);
  await checkSkus(b, req.params.id);
  const { stock, variants, ...rest } = b; // stock is changed through inventory adjustments (atomic + audited), not by overwriting
  const slug = b.slug ? await uniqueSlug(Product, b.slug, req.params.id) : cur.slug;
  if (slug !== cur.slug && !cur.slugHistory.includes(cur.slug)) cur.slugHistory.push(cur.slug); // keeps old URLs redirecting
  cur.set({ ...rest, slug, images: normaliseImages(b.images) ?? cur.images });
  if (cur.status === 'published' && !cur.publishedAt) cur.publishedAt = new Date();
  if (variants) {
    const existing = new Map(cur.variants.map((v: any) => [String(v._id), v]));
    const next = variants.map((v: any) => {
      const old: any = v._id ? existing.get(String(v._id)) : undefined;
      return { ...v, stock: old ? old.stock : v.stock ?? 0, reserved: old?.reserved ?? 0 }; // never overwrite live stock/reservations
    });
    cur.set('variants', next);
  }
  await cur.save();
  await audit(req, 'product.update', 'Product', cur._id);
  res.json({ product: cur });
}));

adminCatalogRouter.patch('/products/:id/status', validate(z.object({ status: z.enum(['draft', 'published', 'archived']) })), asyncHandler(async (req, res) => {
  const $set: any = { status: req.body.status };
  if (req.body.status === 'published') $set.publishedAt = new Date();
  const r = await Product.updateOne({ _id: req.params.id }, { $set });
  if (!r.matchedCount) throw notFound('Product not found.');
  await audit(req, `product.${req.body.status}`, 'Product', req.params.id);
  res.json({ ok: true });
}));

adminCatalogRouter.post('/products/:id/duplicate', asyncHandler(async (req, res) => {
  const p: any = await Product.findById(req.params.id).lean();
  if (!p) throw notFound('Product not found.');
  const { _id, createdAt, updatedAt, slug, slugHistory, sku, soldCount, reserved, publishedAt, ...rest } = p;
  const newSku = `${sku}-COPY${Math.floor(Math.random() * 900 + 100)}`;
  const copy = await Product.create({
    ...rest, name: `${p.name} (copy)`, slug: await uniqueSlug(Product, `${p.name} copy`), sku: newSku, status: 'draft', stock: 0, soldCount: 0,
    variants: (p.variants ?? []).map((v: any, i: number) => ({ ...v, _id: undefined, sku: `${newSku}-V${i + 1}`, stock: 0, reserved: 0 })),
  });
  await audit(req, 'product.duplicate', 'Product', copy._id, { from: String(p._id) });
  res.status(201).json({ product: copy });
}));

// Products referenced by orders are never hard-deleted (order snapshots stay intact either way, but history is easier to follow).
adminCatalogRouter.delete('/products/:id', requireRole('owner'), asyncHandler(async (req, res) => {
  const p: any = await Product.findById(req.params.id);
  if (!p) throw notFound('Product not found.');
  const { Order } = await import('../models/index.js');
  if (await Order.exists({ 'items.productId': p._id })) {
    await Product.updateOne({ _id: p._id }, { $set: { status: 'archived' } });
    await audit(req, 'product.archive', 'Product', p._id);
    return res.json({ archived: true, message: 'This product appears in past orders, so it was archived instead of deleted.' });
  }
  await Product.deleteOne({ _id: p._id });
  for (const i of p.images ?? []) if (i.publicId) await deleteFile(i.publicId, i.publicId.startsWith('wonderktm/') ? 'cloudinary' : 'local');
  await audit(req, 'product.delete', 'Product', p._id);
  res.json({ deleted: true });
}));

// ---------- inventory ----------
adminCatalogRouter.post('/inventory/adjust', validate(z.object({ productId: z.string(), variantId: z.string().optional(), delta: z.number().int().optional(), setTo: z.number().int().min(0).optional(), reason: z.enum(['restock', 'adjustment']), note: z.string().max(300).optional() }).refine((b) => b.delta != null || b.setTo != null, 'Provide delta or setTo')), asyncHandler(async (req, res) => {
  const after = await adjustStock({ ...req.body, by: req.user!._id });
  await audit(req, `inventory.${req.body.reason}`, 'Product', req.body.productId, { delta: req.body.delta, setTo: req.body.setTo, after });
  res.json({ stock: after });
}));
adminCatalogRouter.get('/inventory/movements', asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query as any, 30, 100);
  const f: any = req.query.productId ? { product: req.query.productId } : {};
  const [items, total] = await Promise.all([InventoryMovement.find(f).sort({ at: -1 }).skip(skip).limit(limit).populate('product', 'name sku').populate('by', 'firstName').lean(), InventoryMovement.countDocuments(f)]);
  res.json(paginated(items, total, page, limit));
}));
adminCatalogRouter.get('/inventory/low-stock', asyncHandler(async (_req, res) => {
  const s = await getSettings();
  const products: any[] = await Product.find({ status: { $ne: 'archived' } }).select('name sku stock lowStockThreshold variants images').lean();
  const rows: any[] = [];
  for (const p of products) {
    const th = p.lowStockThreshold ?? s.lowStockThreshold;
    if (p.variants?.length) for (const v of p.variants) { if (v.active !== false && v.stock <= (v.lowStockThreshold ?? th)) rows.push({ productId: String(p._id), variantId: String(v._id), name: `${p.name} — ${v.name}`, sku: v.sku, stock: v.stock, threshold: v.lowStockThreshold ?? th }); }
    else if (p.stock <= th) rows.push({ productId: String(p._id), name: p.name, sku: p.sku, stock: p.stock, threshold: th });
  }
  res.json({ items: rows.sort((a, b) => a.stock - b.stock) });
}));
void AppError; void conflict;
