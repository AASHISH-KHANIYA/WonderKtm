import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AuditLog, Coupon, CouponUsage, FAQ, Notification, PolicyVersion, ShippingZone, StoreSettings, User, WebsiteContent, ROLES } from '../models/index.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/common.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { asyncHandler, pageParams, paginated, slugify } from '../utils/helpers.js';
import { audit } from '../services/audit.js';
import { emailConfigured } from '../services/email.js';
import { getSettings, invalidateSettings } from '../services/settings.js';
import { storageStatus } from '../services/storage.js';
import { couponInput, emailSchema, paymentMethodInput, passwordSchema, zoneInput } from '../validators/schemas.js';
import { dbState } from '../config/db.js';

export const adminStoreRouter = Router();
const owner = requireRole('owner');
const content = requireRole('content_manager');
const orders = requireRole('order_manager');

// ---------- system status ----------
adminStoreRouter.get('/system/status', owner, asyncHandler(async (_req, res) => {
  const s = await getSettings();
  res.json({
    storage: storageStatus(), email: { configured: emailConfigured(), note: emailConfigured() ? 'SMTP is configured.' : 'SMTP is not configured. Emails are recorded as "skipped" and are NOT sent.' },
    database: { transactions: dbState.supportsTransactions }, paymentMethodsActive: s.paymentMethods.filter((m: any) => m.active).length,
    termsPublished: await PolicyVersion.exists({ slug: 'terms', status: 'published' }).then(Boolean),
  });
}));

// ---------- settings ----------
adminStoreRouter.get('/settings', owner, asyncHandler(async (_req, res) => res.json({ settings: await getSettings(true) })));
const settingsSchema = z.object({
  business: z.object({ name: z.string().max(100), tagline: z.string().max(200), address: z.string().max(300), email: z.string().max(254), phone: z.string().max(40), whatsapp: z.string().max(40), hours: z.string().max(100), logoUrl: z.string().max(500).optional(), faviconUrl: z.string().max(500).optional(), social: z.record(z.string().max(300)).optional() }).partial().optional(),
  currencies: z.array(z.enum(['NPR', 'INR'])).min(1).optional(), countries: z.array(z.string().length(2).toUpperCase()).min(1).optional(),
  orderPrefix: z.string().regex(/^[A-Z0-9]{2,6}$/).optional(), lowStockThreshold: z.number().int().min(0).optional(), maxUploadMb: z.number().min(1).max(20).optional(), reservationHours: z.number().min(1).max(720).optional(),
  tax: z.object({ enabled: z.boolean(), label: z.string().max(30), ratePercent: z.number().min(0).max(100), pricesIncludeTax: z.boolean() }).partial().optional(),
  notifications: z.object({ adminEmail: z.string().max(254).optional(), lowStockAlerts: z.boolean().optional() }).optional(),
  maintenanceMode: z.boolean().optional(), maintenanceMessage: z.string().max(300).optional(),
  seoDefaults: z.object({ title: z.string().max(120), description: z.string().max(300), ogImage: z.string().max(500).optional() }).partial().optional(),
  theme: z.record(z.string().regex(/^#[0-9a-fA-F]{6}$/)).optional(),
});
adminStoreRouter.put('/settings', owner, validate(settingsSchema), asyncHandler(async (req, res) => {
  const set: Record<string, unknown> = {};
  const flat = (o: any, p = '') => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object' && !Array.isArray(v) && ['business', 'tax', 'notifications', 'seoDefaults'].includes(p ? p.split('.')[0] : k) && !['social', 'theme'].includes(k)) flat(v, p ? `${p}.${k}` : k); else set[p ? `${p}.${k}` : k] = v; } };
  flat(req.body);
  await StoreSettings.updateOne({ key: 'main' }, { $set: set }, { upsert: true });
  invalidateSettings();
  await audit(req, 'settings.update', 'StoreSettings', 'main', { keys: Object.keys(set) });
  res.json({ settings: await getSettings(true) });
}));

adminStoreRouter.put('/settings/payment-methods/:key', owner, validate(paymentMethodInput), asyncHandler(async (req, res) => {
  if (req.params.key !== req.body.key) throw badRequest('The key in the URL and body must match.');
  const m = req.body;
  if (m.active && m.type === 'qr' && !m.qrImageUrl) throw badRequest('Upload the official QR image before activating this payment method.');
  if (m.active && m.countries.includes('IN') && m.currency === 'INR') {
    // UPI for Nepal-based merchants needs confirmed cross-border settlement; make the operator acknowledge it explicitly.
    if (req.header('x-confirm-cross-border') !== 'yes') throw badRequest('Confirm that you can legally receive INR/UPI payments before enabling Indian payments.');
  }
  const s = await getSettings(true);
  const list = (s.paymentMethods as any[]).filter((x) => x.key !== m.key);
  list.push({ ...m, sortOrder: m.sortOrder ?? list.length });
  await StoreSettings.updateOne({ key: 'main' }, { $set: { paymentMethods: list } });
  invalidateSettings();
  await audit(req, 'settings.payment_method', 'StoreSettings', m.key, { active: m.active });
  res.json({ ok: true });
}));
adminStoreRouter.delete('/settings/payment-methods/:key', owner, asyncHandler(async (req, res) => {
  await StoreSettings.updateOne({ key: 'main' }, { $pull: { paymentMethods: { key: req.params.key } } });
  invalidateSettings();
  await audit(req, 'settings.payment_method_delete', 'StoreSettings', req.params.key);
  res.json({ ok: true });
}));

// ---------- shipping ----------
adminStoreRouter.get('/shipping-zones', orders, asyncHandler(async (_req, res) => res.json({ items: await ShippingZone.find({}).sort({ sortOrder: 1 }).lean() })));
adminStoreRouter.post('/shipping-zones', orders, validate(zoneInput), asyncHandler(async (req, res) => {
  const z = await ShippingZone.create({ ...req.body, key: req.body.key || slugify(req.body.name), cities: req.body.cities.map((c: string) => c.trim()), });
  await audit(req, 'shipping.create', 'ShippingZone', z._id);
  res.status(201).json({ zone: z });
}));
adminStoreRouter.put('/shipping-zones/:id', orders, validate(zoneInput), asyncHandler(async (req, res) => {
  const z = await ShippingZone.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!z) throw notFound('Zone not found.');
  await audit(req, 'shipping.update', 'ShippingZone', z._id);
  res.json({ zone: z });
}));
adminStoreRouter.delete('/shipping-zones/:id', orders, asyncHandler(async (req, res) => {
  await ShippingZone.deleteOne({ _id: req.params.id });
  await audit(req, 'shipping.delete', 'ShippingZone', req.params.id);
  res.json({ ok: true });
}));

// ---------- coupons ----------
const couponRole = requireRole('order_manager', 'content_manager');
adminStoreRouter.get('/coupons', couponRole, asyncHandler(async (_req, res) => {
  const items = await Coupon.find({}).sort({ createdAt: -1 }).limit(500).lean();
  const usage = await CouponUsage.aggregate([{ $match: { released: false } }, { $group: { _id: '$coupon', uses: { $sum: 1 }, discount: { $sum: '$discount' } } }]);
  const um = new Map(usage.map((u: any) => [String(u._id), u]));
  res.json({ items: items.map((c: any) => ({ ...c, performance: { uses: um.get(String(c._id))?.uses ?? 0, discountGiven: um.get(String(c._id))?.discount ?? 0 } })) });
}));
adminStoreRouter.post('/coupons', couponRole, validate(couponInput), asyncHandler(async (req, res) => {
  if (await Coupon.exists({ code: req.body.code })) throw conflict('A coupon with this code already exists.');
  const c = await Coupon.create(req.body);
  await audit(req, 'coupon.create', 'Coupon', c._id);
  res.status(201).json({ coupon: c });
}));
adminStoreRouter.put('/coupons/:id', couponRole, validate(couponInput), asyncHandler(async (req, res) => {
  const c = await Coupon.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!c) throw notFound('Coupon not found.');
  await audit(req, 'coupon.update', 'Coupon', c._id);
  res.json({ coupon: c });
}));
adminStoreRouter.delete('/coupons/:id', couponRole, asyncHandler(async (req, res) => {
  if (await CouponUsage.exists({ coupon: req.params.id })) { await Coupon.updateOne({ _id: req.params.id }, { $set: { active: false } }); return res.json({ deactivated: true }); }
  await Coupon.deleteOne({ _id: req.params.id });
  res.json({ deleted: true });
}));

// ---------- website content (draft + publish) ----------
const KEYS = ['homepage', 'announcement', 'about', 'contact', 'footer', 'shipping-info'];
adminStoreRouter.get('/content/:key', content, asyncHandler(async (req, res) => {
  const d = await WebsiteContent.findOne({ key: req.params.key }).lean();
  res.json({ draft: d?.draft ?? {}, published: d?.published ?? {}, publishedAt: d?.publishedAt });
}));
adminStoreRouter.put('/content/:key', content, asyncHandler(async (req, res) => {
  if (!KEYS.includes(req.params.key)) throw badRequest('Unknown content block.');
  if (typeof req.body !== 'object' || Array.isArray(req.body) || JSON.stringify(req.body).length > 200_000) throw badRequest('Invalid content.');
  await WebsiteContent.updateOne({ key: req.params.key }, { $set: { draft: req.body, updatedBy: req.user!._id } }, { upsert: true });
  await audit(req, 'content.draft', 'WebsiteContent', req.params.key);
  res.json({ ok: true });
}));
adminStoreRouter.post('/content/:key/publish', content, asyncHandler(async (req, res) => {
  const d: any = await WebsiteContent.findOne({ key: req.params.key });
  if (!d) throw notFound('Nothing to publish yet. Save a draft first.');
  d.published = d.draft; d.publishedAt = new Date(); d.markModified('published');
  await d.save();
  await audit(req, 'content.publish', 'WebsiteContent', req.params.key);
  res.json({ ok: true });
}));

// ---------- FAQs ----------
adminStoreRouter.get('/faqs', content, asyncHandler(async (_req, res) => res.json({ items: await FAQ.find({}).sort({ sortOrder: 1 }).lean() })));
const faqSchema = z.object({ question: z.string().trim().min(3).max(300), answer: z.string().trim().min(1).max(3000), category: z.string().max(60).optional(), sortOrder: z.number().int().optional(), published: z.boolean().optional() });
adminStoreRouter.post('/faqs', content, validate(faqSchema), asyncHandler(async (req, res) => { const f = await FAQ.create(req.body); await audit(req, 'faq.create', 'FAQ', f._id); res.status(201).json({ faq: f }); }));
adminStoreRouter.put('/faqs/:id', content, validate(faqSchema), asyncHandler(async (req, res) => { const f = await FAQ.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }); if (!f) throw notFound(); await audit(req, 'faq.update', 'FAQ', f._id); res.json({ faq: f }); }));
adminStoreRouter.delete('/faqs/:id', content, asyncHandler(async (req, res) => { await FAQ.deleteOne({ _id: req.params.id }); await audit(req, 'faq.delete', 'FAQ', req.params.id); res.json({ ok: true }); }));

// ---------- policies (versioned) ----------
adminStoreRouter.get('/policies', content, asyncHandler(async (_req, res) => res.json({ items: await PolicyVersion.find({}).sort({ slug: 1, version: -1 }).limit(300).lean() })));
const policySchema = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), title: z.string().min(2).max(120), body: z.string().min(1).max(60000), effectiveDate: z.coerce.date().optional() });
adminStoreRouter.post('/policies', content, validate(policySchema), asyncHandler(async (req, res) => {
  const last = await PolicyVersion.findOne({ slug: req.body.slug }).sort({ version: -1 }).lean();
  const p = await PolicyVersion.create({ ...req.body, version: (last?.version ?? 0) + 1, status: 'draft', createdBy: req.user!._id });
  await audit(req, 'policy.draft', 'PolicyVersion', p._id, { slug: p.slug, version: p.version });
  res.status(201).json({ policy: p });
}));
adminStoreRouter.put('/policies/:id', content, validate(policySchema.partial()), asyncHandler(async (req, res) => {
  const p: any = await PolicyVersion.findById(req.params.id);
  if (!p) throw notFound();
  if (p.status === 'published') throw conflict('Published versions are immutable. Create a new version instead.');
  p.set(req.body); p.ownerReviewed = false; await p.save();
  res.json({ policy: p });
}));
adminStoreRouter.post('/policies/:id/review', owner, asyncHandler(async (req, res) => {
  await PolicyVersion.updateOne({ _id: req.params.id, status: 'draft' }, { $set: { ownerReviewed: true } });
  await audit(req, 'policy.owner_review', 'PolicyVersion', req.params.id);
  res.json({ ok: true });
}));
// Publishing requires the owner's review flag — legal text must not go live without the owner signing off.
adminStoreRouter.post('/policies/:id/publish', content, asyncHandler(async (req, res) => {
  const p: any = await PolicyVersion.findById(req.params.id);
  if (!p) throw notFound();
  if (!p.ownerReviewed) throw badRequest('The owner must review this policy before it can be published.');
  await PolicyVersion.updateMany({ slug: p.slug, status: 'published' }, { $set: { status: 'superseded' } });
  p.status = 'published'; p.effectiveDate = p.effectiveDate ?? new Date(); await p.save();
  if (p.slug === 'terms') { await StoreSettings.updateOne({ key: 'main' }, { $set: { termsVersion: String(p.version) } }); invalidateSettings(); }
  await audit(req, 'policy.publish', 'PolicyVersion', p._id, { slug: p.slug, version: p.version });
  res.json({ policy: p });
}));
adminStoreRouter.post('/policies/:id/unpublish', content, asyncHandler(async (req, res) => {
  await PolicyVersion.updateOne({ _id: req.params.id, status: 'published' }, { $set: { status: 'unpublished' } });
  await audit(req, 'policy.unpublish', 'PolicyVersion', req.params.id);
  res.json({ ok: true });
}));

// ---------- staff (owner only) ----------
adminStoreRouter.get('/staff', owner, asyncHandler(async (_req, res) => res.json({ items: await User.find({ role: { $ne: 'customer' } }).select('email firstName lastName role status lastLoginAt').lean() })));
adminStoreRouter.post('/staff', owner, validate(z.object({ email: emailSchema, firstName: z.string().min(1).max(60), password: passwordSchema, role: z.enum(ROLES).refine((r) => r !== 'customer') })), asyncHandler(async (req, res) => {
  if (await User.exists({ email: req.body.email })) throw conflict('That email is already registered.');
  const u = await User.create({ email: req.body.email, firstName: req.body.firstName, passwordHash: await bcrypt.hash(req.body.password, 12), role: req.body.role, emailVerified: true });
  await audit(req, 'staff.create', 'User', u._id, { role: u.role });
  res.status(201).json({ id: String(u._id) });
}));
adminStoreRouter.patch('/staff/:id', owner, validate(z.object({ role: z.enum(ROLES).optional(), status: z.enum(['active', 'disabled']).optional() })), asyncHandler(async (req, res) => {
  if (String(req.user!._id) === req.params.id) throw badRequest('You cannot change your own role or status.');
  const r = await User.updateOne({ _id: req.params.id, role: { $ne: 'customer' } }, { $set: req.body, $inc: { tokenVersion: 1 } });
  if (!r.matchedCount) throw notFound();
  await audit(req, 'staff.update', 'User', req.params.id, req.body);
  res.json({ ok: true });
}));

// ---------- audit + notifications ----------
adminStoreRouter.get('/audit-logs', owner, asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query as any, 50, 200);
  const [items, total] = await Promise.all([AuditLog.find({}).sort({ at: -1 }).skip(skip).limit(limit).lean(), AuditLog.countDocuments({})]);
  res.json(paginated(items, total, page, limit));
}));
adminStoreRouter.get('/notifications', requireRole('order_manager', 'inventory_manager'), asyncHandler(async (_req, res) => res.json({ items: await Notification.find({}).sort({ createdAt: -1 }).limit(50).lean() })));
