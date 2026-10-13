import { Router } from 'express';
import { z } from 'zod';
import { AuditLog, Order, OrderStatusHistory, PaymentAttempt, User, FULFILMENT_STATUSES } from '../models/index.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/common.js';
import { AppError, badRequest, conflict, notFound } from '../utils/errors.js';
import { asyncHandler, escapeRegex, pageParams, paginated, round2 } from '../utils/helpers.js';
import { audit } from '../services/audit.js';
import { cancelOrder, commitOrderInventory, expireStaleOrders, recordHistory } from '../services/orders.js';
import { approvePayment, rejectPayment, startReview } from '../services/payments.js';
import { canMoveFulfilment, canMovePayment } from '../services/stateMachine.js';
import { getSettings } from '../services/settings.js';
import { readPrivate } from '../services/storage.js';
import { releaseStock } from '../services/inventory.js';
import { notify } from '../services/email.js';
import { toCsv } from '../utils/csv.js';

export const adminOrdersRouter = Router();
const orderStaff = requireRole('order_manager');
adminOrdersRouter.use(['/orders', '/payments', '/customers', '/customers-export.csv', '/maintenance'], orderStaff);

function orderFilter(q: Record<string, string>) {
  const f: any = {};
  if (q.paymentStatus) f.paymentStatus = q.paymentStatus;
  if (q.fulfilmentStatus) f.fulfilmentStatus = q.fulfilmentStatus;
  if (q.method) f.paymentMethodKey = q.method;
  if (q.currency) f.currency = q.currency;
  if (q.city) f['shippingAddress.city'] = new RegExp(`^${escapeRegex(q.city)}$`, 'i');
  if (q.from || q.to) f.placedAt = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  if (q.minTotal || q.maxTotal) f.total = { ...(q.minTotal ? { $gte: Number(q.minTotal) } : {}), ...(q.maxTotal ? { $lte: Number(q.maxTotal) } : {}) };
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q.slice(0, 60)), 'i');
    f.$or = [{ orderNumber: rx }, { 'customer.email': rx }, { 'customer.firstName': rx }, { 'customer.lastName': rx }, { 'customer.phone': rx }];
  }
  return f;
}

adminOrdersRouter.get('/orders', asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageParams(req.query as any, 20, 100);
  const f = orderFilter(req.query as any);
  const [items, total] = await Promise.all([Order.find(f).sort({ placedAt: -1 }).skip(skip).limit(limit).select('-items.categoryId').lean(), Order.countDocuments(f)]);
  res.json(paginated(items, total, page, limit));
}));

adminOrdersRouter.get('/orders/export.csv', requireRole('order_manager'), asyncHandler(async (req, res) => {
  const rows = (await Order.find(orderFilter(req.query as any)).sort({ placedAt: -1 }).limit(5000).lean()).map((o: any) => ({
    orderNumber: o.orderNumber, placedAt: o.placedAt, customer: `${o.customer.firstName} ${o.customer.lastName}`, email: o.customer.email, phone: o.customer.phone, city: o.shippingAddress.city, country: o.shippingAddress.country,
    currency: o.currency, subtotal: o.subtotal, discount: o.discountTotal, shipping: o.shippingTotal, total: o.total, paymentMethod: o.paymentMethodKey, paymentStatus: o.paymentStatus, fulfilmentStatus: o.fulfilmentStatus,
  }));
  await audit(req, 'export.orders', 'Order', undefined, { count: rows.length });
  res.type('text/csv').attachment('orders.csv').send(toCsv(rows, ['orderNumber', 'placedAt', 'customer', 'email', 'phone', 'city', 'country', 'currency', 'subtotal', 'discount', 'shipping', 'total', 'paymentMethod', 'paymentStatus', 'fulfilmentStatus']));
}));

adminOrdersRouter.get('/orders/:id', asyncHandler(async (req, res) => {
  const order: any = await Order.findById(req.params.id).populate('notes.by', 'firstName email').lean();
  if (!order) throw notFound('Order not found.');
  const [attempts, history, audits] = await Promise.all([
    PaymentAttempt.find({ order: order._id }).sort({ attemptNo: -1 }).populate('decision.by', 'firstName email').lean(),
    OrderStatusHistory.find({ order: order._id }).sort({ at: 1 }).populate('by', 'firstName email').lean(),
    AuditLog.find({ entity: 'Order', entityId: String(order._id) }).sort({ at: -1 }).limit(50).lean(),
  ]);
  res.json({ order, payments: attempts.map((a: any) => ({ ...a, evidence: a.evidence.map((e: any) => ({ id: String(e._id), originalName: e.originalName, mime: e.mime, size: e.size, uploadedAt: e.uploadedAt })) })), history, audit: audits });
}));

const statusSchema = z.object({ status: z.enum(FULFILMENT_STATUSES), note: z.string().max(500).optional(), carrier: z.string().max(80).optional(), trackingNumber: z.string().max(120).optional(), restock: z.boolean().optional() });

adminOrdersRouter.patch('/orders/:id/status', validate(statusSchema), asyncHandler(async (req, res) => {
  const order: any = await Order.findById(req.params.id);
  if (!order) throw notFound('Order not found.');
  const { status: to, note, carrier, trackingNumber, restock } = req.body;
  const settings = await getSettings();
  const method = settings.paymentMethods.find((m: any) => m.key === order.paymentMethodKey);
  const check = canMoveFulfilment({ ...order.toObject(), paymentType: method?.type }, to);
  if (!check.ok) throw conflict(check.reason, 'INVALID_TRANSITION');
  const from = order.fulfilmentStatus;
  if (to === 'cancelled') {
    await cancelOrder(order, { type: 'staff', id: req.user!._id }, note || 'Cancelled by staff');
  } else {
    const $set: any = { fulfilmentStatus: to };
    if (to === 'shipped') Object.assign($set, { 'shipment.carrier': carrier, 'shipment.trackingNumber': trackingNumber, 'shipment.shippedAt': new Date(), 'shipment.note': note });
    if (to === 'delivered') $set['shipment.deliveredAt'] = new Date();
    const r = await Order.updateOne({ _id: order._id, fulfilmentStatus: from }, { $set }); // optimistic guard against concurrent edits
    if (r.modifiedCount !== 1) throw conflict('The order changed while you were editing. Reload and try again.', 'STALE');
    await recordHistory(order, 'fulfilment', from, to, { type: 'staff', id: req.user!._id }, note);
    if (to === 'confirmed' && method?.type === 'cod') await commitOrderInventory(order);
    if (to === 'returned' && restock && order.inventoryState === 'committed') {
      await Order.updateOne({ _id: order._id }, { $set: { inventoryState: 'released' } });
      await releaseStock(order.items.map((l: any) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, sku: l.sku })), 'committed', order._id, req.user!._id);
    }
    const ev = ({ confirmed: 'order_confirmed', shipped: 'order_shipped', delivered: 'order_delivered' } as any)[to];
    if (ev) void notify(ev, order.customer.email, { orderNumber: order.orderNumber, carrier, trackingNumber }, order._id);
  }
  await audit(req, 'order.status', 'Order', order._id, { from, to, note });
  res.json({ order: await Order.findById(order._id).lean() });
}));

adminOrdersRouter.post('/orders/:id/notes', validate(z.object({ text: z.string().trim().min(1).max(1000) })), asyncHandler(async (req, res) => {
  const r = await Order.updateOne({ _id: req.params.id, 'notes.99': { $exists: false } }, { $push: { notes: { text: req.body.text, by: req.user!._id } } });
  if (r.modifiedCount !== 1) throw badRequest('Could not add note.');
  await audit(req, 'order.note', 'Order', req.params.id);
  res.status(201).json({ ok: true });
}));

adminOrdersRouter.post('/orders/:id/cod-collected', asyncHandler(async (req, res) => {
  const o: any = await Order.findById(req.params.id);
  if (!o) throw notFound('Order not found.');
  const method = (await getSettings()).paymentMethods.find((m: any) => m.key === o.paymentMethodKey);
  if (method?.type !== 'cod') throw badRequest('Only cash-on-delivery orders can be marked as collected.');
  const c = canMovePayment(o.paymentStatus, 'paid');
  if (!c.ok) throw conflict(c.reason);
  await Order.updateOne({ _id: o._id, paymentStatus: o.paymentStatus }, { $set: { paymentStatus: 'paid' } });
  await recordHistory(o, 'payment', o.paymentStatus, 'paid', { type: 'staff', id: req.user!._id }, 'Cash collected on delivery');
  await audit(req, 'order.cod_collected', 'Order', o._id);
  res.json({ ok: true });
}));

adminOrdersRouter.post('/orders/:id/refund', validate(z.object({ action: z.enum(['request', 'partial', 'full']), amount: z.number().positive().optional(), note: z.string().max(300).optional() })), asyncHandler(async (req, res) => {
  const o: any = await Order.findById(req.params.id);
  if (!o) throw notFound('Order not found.');
  const { action, amount, note } = req.body;
  let to: any = 'refund_pending';
  let refunded = o.refundedAmount ?? 0;
  if (action === 'partial') { if (!amount) throw badRequest('Enter the refund amount.'); refunded = round2(refunded + amount); to = refunded >= o.total ? 'refunded' : 'partially_refunded'; }
  if (action === 'full') { refunded = o.total; to = 'refunded'; }
  if (refunded > o.total) throw badRequest('Refunds cannot exceed the order total.');
  const c = canMovePayment(o.paymentStatus, to);
  if (!c.ok) throw conflict(c.reason, 'INVALID_TRANSITION');
  const r = await Order.updateOne({ _id: o._id, paymentStatus: o.paymentStatus }, { $set: { paymentStatus: to, refundedAmount: refunded } });
  if (r.modifiedCount !== 1) throw conflict('The order changed. Reload and try again.', 'STALE');
  await recordHistory(o, 'payment', o.paymentStatus, to, { type: 'staff', id: req.user!._id }, note);
  void notify('refund_update', o.customer.email, { orderNumber: o.orderNumber, status: to }, o._id);
  await audit(req, 'order.refund', 'Order', o._id, { action, amount, to });
  res.json({ ok: true, paymentStatus: to, refundedAmount: refunded });
}));

adminOrdersRouter.post('/maintenance/expire-stale-orders', requireRole('owner'), asyncHandler(async (_req, res) => res.json({ cancelled: await expireStaleOrders() })));

// ---------- payment verification ----------
adminOrdersRouter.get('/payments', asyncHandler(async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, skip } = pageParams(q, 20, 100);
  const f: any = { status: q.status || { $in: ['submitted', 'under_review'] } };
  if (q.status === 'all') delete f.status;
  if (q.method) f.methodKey = q.method;
  if (q.currency) f.currency = q.currency;
  if (q.minAmount || q.maxAmount) f.amount = { ...(q.minAmount ? { $gte: Number(q.minAmount) } : {}), ...(q.maxAmount ? { $lte: Number(q.maxAmount) } : {}) };
  if (q.from || q.to) f.submittedAt = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
  if (q.orderNumber) {
    const ids = await Order.find({ orderNumber: new RegExp(escapeRegex(q.orderNumber), 'i') }).select('_id').limit(50).lean();
    f.order = { $in: ids.map((o) => o._id) };
  }
  const [items, total] = await Promise.all([PaymentAttempt.find(f).sort({ submittedAt: 1 }).skip(skip).limit(limit).populate('order', 'orderNumber customer total currency paymentMethodLabel paymentStatus fulfilmentStatus').populate('decision.by', 'firstName email').lean(), PaymentAttempt.countDocuments(f)]);
  const settings = await getSettings();
  res.json(paginated(items.map((a: any) => ({ ...a, merchantInfo: settings.paymentMethods.find((m: any) => m.key === a.methodKey)?.merchantInfo, evidence: a.evidence.map((e: any) => ({ id: String(e._id), originalName: e.originalName, mime: e.mime, size: e.size, uploadedAt: e.uploadedAt })) })), total, page, limit));
}));

// Private evidence is streamed only to authorised staff and never receives a public URL.
adminOrdersRouter.get('/payments/:attemptId/evidence/:evidenceId', asyncHandler(async (req, res) => {
  const a: any = await PaymentAttempt.findById(req.params.attemptId);
  const e = a?.evidence.id(req.params.evidenceId);
  if (!a || !e) throw notFound('Evidence not found.');
  const { data, mime } = await readPrivate(e.storageKey, e.provider);
  await audit(req, 'payment.evidence_viewed', 'PaymentAttempt', a._id);
  res.set({ 'Content-Type': mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }).send(data);
}));

adminOrdersRouter.post('/payments/:id/review', asyncHandler(async (req, res) => {
  const a = await startReview(req.params.id, req.user!._id);
  await audit(req, 'payment.review_started', 'PaymentAttempt', a._id);
  res.json({ ok: true });
}));
adminOrdersRouter.post('/payments/:id/approve', validate(z.object({ fundsConfirmed: z.boolean() })), asyncHandler(async (req, res) => {
  const a = await approvePayment(req.params.id, req.user!, req.body.fundsConfirmed);
  await audit(req, 'payment.approved', 'PaymentAttempt', a._id, { order: String(a.order), amount: a.amount, currency: a.currency });
  res.json({ ok: true });
}));
adminOrdersRouter.post('/payments/:id/reject', validate(z.object({ reason: z.string().trim().min(3).max(300) })), asyncHandler(async (req, res) => {
  const a = await rejectPayment(req.params.id, req.user!, req.body.reason);
  await audit(req, 'payment.rejected', 'PaymentAttempt', a._id, { order: String(a.order), reason: req.body.reason });
  res.json({ ok: true });
}));

// ---------- customers ----------
adminOrdersRouter.get('/customers', asyncHandler(async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, skip } = pageParams(q, 20, 100);
  const f: any = { role: 'customer' };
  if (q.q) { const rx = new RegExp(escapeRegex(q.q.slice(0, 60)), 'i'); f.$or = [{ email: rx }, { firstName: rx }, { lastName: rx }, { phone: rx }]; }
  const [items, total] = await Promise.all([User.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).select('email firstName lastName phone status createdAt lastLoginAt emailVerified').lean(), User.countDocuments(f)]);
  const stats = await Order.aggregate([{ $match: { user: { $in: items.map((i: any) => i._id) }, fulfilmentStatus: { $ne: 'cancelled' } } }, { $group: { _id: { u: '$user', c: '$currency' }, orders: { $sum: 1 }, spent: { $sum: '$total' } } }]);
  res.json(paginated(items.map((u: any) => ({ ...u, stats: stats.filter((s: any) => String(s._id.u) === String(u._id)).map((s: any) => ({ currency: s._id.c, orders: s.orders, spent: s.spent })) })), total, page, limit));
}));
adminOrdersRouter.get('/customers/:id', asyncHandler(async (req, res) => {
  const u: any = await User.findOne({ _id: req.params.id, role: 'customer' }).select('+internalNotes').populate('internalNotes.by', 'firstName').lean();
  if (!u) throw notFound('Customer not found.');
  const orders = await Order.find({ $or: [{ user: u._id }, { 'customer.email': u.email }] }).sort({ placedAt: -1 }).limit(50).select('orderNumber placedAt total currency paymentStatus fulfilmentStatus').lean();
  await audit(req, 'customer.viewed', 'User', u._id);
  res.json({ customer: u, orders });
}));
adminOrdersRouter.post('/customers/:id/notes', validate(z.object({ text: z.string().trim().min(1).max(1000) })), asyncHandler(async (req, res) => {
  const r = await User.updateOne({ _id: req.params.id, role: 'customer' }, { $push: { internalNotes: { note: req.body.text, by: req.user!._id } } });
  if (!r.matchedCount) throw notFound('Customer not found.');
  await audit(req, 'customer.note', 'User', req.params.id);
  res.status(201).json({ ok: true });
}));
adminOrdersRouter.patch('/customers/:id/status', validate(z.object({ status: z.enum(['active', 'disabled']) })), asyncHandler(async (req, res) => {
  const r = await User.updateOne({ _id: req.params.id, role: 'customer' }, { $set: { status: req.body.status }, $inc: { tokenVersion: req.body.status === 'disabled' ? 1 : 0 } });
  if (!r.matchedCount) throw notFound('Customer not found.');
  await audit(req, 'customer.status', 'User', req.params.id, { status: req.body.status });
  res.json({ ok: true });
}));
adminOrdersRouter.get('/customers-export.csv', asyncHandler(async (req, res) => {
  const rows = (await User.find({ role: 'customer' }).sort({ createdAt: -1 }).limit(10000).select('email firstName lastName phone createdAt marketingConsent').lean()).map((u: any) => ({ email: u.email, firstName: u.firstName, lastName: u.lastName, phone: u.phone, joined: u.createdAt, marketingConsent: u.marketingConsent }));
  await audit(req, 'export.customers', 'User', undefined, { count: rows.length });
  res.type('text/csv').attachment('customers.csv').send(toCsv(rows, ['email', 'firstName', 'lastName', 'phone', 'joined', 'marketingConsent']));
}));
void AppError;
