import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { withOptionalTransaction } from '../config/db.js';
import { Category, Counter, Coupon, CouponUsage, Order, OrderStatusHistory, PaymentAttempt, Product, ShippingZone, User } from '../models/index.js';
import { AppError, badRequest, conflict } from '../utils/errors.js';
import { escapeRegex, round2, sha256 } from '../utils/helpers.js';
import { checkoutSchema, quoteSchema } from '../validators/schemas.js';
import { evaluateCoupon } from './coupons.js';
import { releaseStock, reserveStock, commitStock } from './inventory.js';
import { notify, notifyAdmin } from './email.js';
import { computeTotals, unitPrice, type Currency } from './pricing.js';
import { getSettings } from './settings.js';
import { quoteShipping } from './shipping.js';
import { canMoveFulfilment, canMovePayment } from './stateMachine.js';

export type QuoteInput = z.infer<typeof quoteSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Deterministic, unguessable guest tracking token (HMAC with a server secret). Safe to re-derive on idempotent retries. */
export const trackingTokenFor = (orderNumber: string) => crypto.createHmac('sha256', env.JWT_SECRET).update(`track:${orderNumber}`).digest('base64url');
export const trackingUrl = (orderNumber: string) => `${env.CLIENT_URL}/track?order=${encodeURIComponent(orderNumber)}&token=${trackingTokenFor(orderNumber)}`;

export function eligiblePaymentMethods(settings: any, country: string, currency: Currency, subtotal: number) {
  return (settings.paymentMethods as any[])
    .filter((m) => m.active && m.countries.includes(country) && m.currency === currency && (m.minOrder == null || subtotal >= m.minOrder) && (m.maxOrder == null || subtotal <= m.maxOrder))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Single source of truth for pricing. Used by both the cart quote and order creation so the numbers always agree. */
export async function priceCart(input: QuoteInput, opts: { userId?: unknown } = {}) {
  const settings = await getSettings();
  const currency = input.currency as Currency;
  if (!settings.currencies.includes(currency)) throw badRequest(`${currency} orders are not enabled.`);
  const country = input.country ?? (currency === 'INR' ? 'IN' : 'NP');
  if (!settings.countries.includes(country)) throw badRequest('We do not deliver to this country yet.');

  const ids = [...new Set(input.items.map((i) => i.productId))];
  const products = await Product.find({ _id: { $in: ids }, status: 'published' }).lean();
  const byId = new Map(products.map((p: any) => [String(p._id), p]));
  const lines: any[] = [];
  const restricted = new Set<string>();
  const merged = new Map<string, { productId: string; variantId?: string; quantity: number }>();
  for (const i of input.items) {
    const k = `${i.productId}:${i.variantId ?? ''}`;
    const e = merged.get(k);
    if (e) e.quantity += i.quantity;
    else merged.set(k, { ...i });
  }
  for (const i of merged.values()) {
    const p: any = byId.get(i.productId);
    if (!p) throw new AppError(409, 'An item in your cart is no longer available.', 'ITEM_UNAVAILABLE', { productId: i.productId });
    let variant: any;
    if (p.variants?.length) {
      variant = p.variants.find((v: any) => String(v._id) === i.variantId && v.active);
      if (!variant) throw new AppError(400, `Please choose an option for ${p.name}.`, 'VARIANT_REQUIRED', { productId: i.productId });
    } else if (i.variantId) throw badRequest('Invalid option selected.');
    const stock = variant ? variant.stock : p.stock;
    if (stock < i.quantity) throw new AppError(409, stock <= 0 ? `${p.name} is out of stock.` : `Only ${stock} of ${p.name} left.`, 'OUT_OF_STOCK', { productId: i.productId, available: stock });
    const price = unitPrice(p, variant, currency);
    if (!price) throw new AppError(400, `${p.name} is not available in ${currency}.`, 'CURRENCY_UNAVAILABLE');
    (p.deliveryRestrictions ?? []).forEach((r: string) => restricted.add(r));
    const img = p.images?.find((x: any) => x.isPrimary) ?? p.images?.[0];
    lines.push({
      productId: p._id, variantId: variant?._id, name: p.name, variantLabel: variant?.name, sku: variant?.sku ?? p.sku, image: img?.url,
      unitPrice: price.unit, listPrice: price.list, quantity: i.quantity, lineTotal: round2(price.unit * i.quantity), categoryId: p.category,
      _categoryIds: [p.category, p.subcategory].filter(Boolean).map(String),
    });
  }
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

  let couponRes: { code: string; id: unknown; discount: number; freeShipping: boolean } | null = null;
  let couponError: string | undefined;
  if (input.couponCode) {
    const coupon = await Coupon.findOne({ code: input.couponCode.trim().toUpperCase() }).lean();
    const email = input.email;
    const [usage, prior] = await Promise.all([
      coupon && (email || opts.userId) ? CouponUsage.countDocuments({ coupon: coupon._id, released: false, $or: [...(email ? [{ email }] : []), ...(opts.userId ? [{ user: opts.userId }] : [])] }) : 0,
      email || opts.userId ? Order.countDocuments({ fulfilmentStatus: { $ne: 'cancelled' }, $or: [...(email ? [{ 'customer.email': email }] : []), ...(opts.userId ? [{ user: opts.userId }] : [])] }) : 0,
    ]);
    const r = evaluateCoupon(coupon as any, {
      currency, subtotal, customerUsageCount: usage, isFirstOrder: prior === 0,
      lines: lines.map((l) => ({ productId: String(l.productId), categoryIds: l._categoryIds, lineTotal: l.lineTotal })),
    });
    if (r.ok && coupon) couponRes = { code: coupon.code, id: coupon._id, discount: r.discount, freeShipping: r.freeShipping };
    else if (!r.ok) couponError = r.reason;
  }

  let shipping: any = null;
  let shippingError: string | undefined;
  if (input.city) {
    const zones = await ShippingZone.find({ active: true }).lean();
    const q = quoteShipping({ zones: zones as any, country, city: input.city, district: input.district, currency, subtotal, couponFreeShipping: couponRes?.freeShipping, restrictedKeys: [...restricted] });
    if (q.ok) shipping = q;
    else shippingError = q.reason;
  }
  const totals = computeTotals({
    lines: lines.map((l) => ({ unit: l.unitPrice, quantity: l.quantity })), discount: couponRes?.discount ?? 0, shipping: shipping?.charge ?? 0,
    taxEnabled: settings.tax?.enabled, taxRatePercent: settings.tax?.ratePercent, pricesIncludeTax: settings.tax?.pricesIncludeTax,
  });
  const methods = eligiblePaymentMethods(settings, country, currency, subtotal).filter((m) => m.type !== 'cod' || (shipping?.codAllowed ?? false));
  return { currency, country, lines, totals, coupon: couponRes, couponError, shipping, shippingError, paymentMethods: methods, settings };
}

async function nextOrderNumber(prefix: string) {
  const c = await Counter.findOneAndUpdate({ _id: 'order' }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `${prefix}-${String(c.seq + 1000).padStart(6, '0')}`;
}

export async function recordHistory(order: any, kind: 'payment' | 'fulfilment', from: string | undefined, to: string, actor: { id?: unknown; type: 'staff' | 'customer' | 'system' }, note?: string) {
  await OrderStatusHistory.create({ order: order._id ?? order, kind, from, to, by: actor.id, actorType: actor.type, note });
}

export async function createOrder(input: CheckoutInput, ctx: { userId?: unknown; idempotencyKey?: string }) {
  if (ctx.idempotencyKey) {
    const existing = await Order.findOne({ idempotencyKey: ctx.idempotencyKey });
    if (existing) return { order: existing, duplicate: true };
  }
  const settings = await getSettings();
  if (settings.maintenanceMode) throw new AppError(503, settings.maintenanceMessage, 'MAINTENANCE');
  const priced = await priceCart({ items: input.items, currency: input.currency, country: input.shippingAddress.country, city: input.shippingAddress.city, district: input.shippingAddress.district, couponCode: input.couponCode, email: input.customer.email }, { userId: ctx.userId });
  if (input.couponCode && priced.couponError) throw new AppError(400, priced.couponError, 'COUPON_INVALID');
  if (!priced.shipping) throw new AppError(400, priced.shippingError ?? 'We cannot deliver to this location.', 'SHIPPING_UNAVAILABLE');
  const method = priced.paymentMethods.find((m: any) => m.key === input.paymentMethodKey);
  if (!method) throw new AppError(400, 'That payment method is not available for your order.', 'PAYMENT_METHOD_UNAVAILABLE');
  const isCod = method.type === 'cod';
  const orderNumber = await nextOrderNumber(settings.orderPrefix || 'WK');
  const billing = input.billingSameAsShipping ? input.shippingAddress : input.billingAddress ?? input.shippingAddress;

  const orderId = new (Order as any)()._id;
  const items = priced.lines.map(({ _categoryIds, ...l }: any) => l);
  let order: any;
  try {
    order = await withOptionalTransaction(async (session) => {
      await reserveStock(items.map((l: any) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, sku: l.sku })), orderId, session);
      const [o] = await Order.create(
        [{
          _id: orderId, orderNumber, user: ctx.userId, customer: input.customer, recipient: input.recipient, shippingAddress: input.shippingAddress, billingAddress: billing,
          items, currency: priced.currency, subtotal: priced.totals.subtotal, discountTotal: priced.totals.discount, shippingTotal: priced.totals.shipping, taxTotal: priced.totals.tax, total: priced.totals.total,
          coupon: priced.coupon ? { code: priced.coupon.code, couponId: priced.coupon.id, discount: priced.coupon.discount, freeShipping: priced.coupon.freeShipping } : undefined,
          shipping: { zoneName: priced.shipping.zoneName, methodName: priced.shipping.methodName, estimatedDays: priced.shipping.estimatedDays, isFree: priced.shipping.isFree },
          paymentMethodKey: method.key, paymentMethodLabel: method.label, paymentStatus: isCod ? 'unpaid' : 'awaiting_evidence', fulfilmentStatus: isCod ? 'confirmed' : 'awaiting_payment_verification',
          trackingTokenHash: sha256(trackingTokenFor(orderNumber)), idempotencyKey: ctx.idempotencyKey,
          termsAccepted: { version: settings.termsVersion, at: new Date() }, marketingConsent: input.marketingConsent, customerNote: input.customerNote, inventoryState: 'reserved',
        }],
        { session }
      );
      if (!isCod) await PaymentAttempt.create([{ order: o._id, attemptNo: 1, methodKey: method.key, amount: o.total, currency: o.currency, status: 'awaiting_evidence' }], { session });
      if (priced.coupon) {
        // atomic usage-limit enforcement
        const c: any = await Coupon.findById(priced.coupon.id).lean();
        const r = await Coupon.updateOne({ _id: priced.coupon.id, ...(c?.usageLimit != null ? { usedCount: { $lt: c.usageLimit } } : {}) }, { $inc: { usedCount: 1 } }, { session });
        if (r.modifiedCount !== 1) throw new AppError(400, 'This coupon has reached its usage limit.', 'COUPON_INVALID');
        await CouponUsage.create([{ coupon: priced.coupon.id, order: o._id, email: input.customer.email, user: ctx.userId, discount: priced.coupon.discount }], { session });
      }
      return o;
    });
  } catch (e: any) {
    if (e?.code === 11000 && ctx.idempotencyKey) {
      const dup = await Order.findOne({ idempotencyKey: ctx.idempotencyKey });
      if (dup) return { order: dup, duplicate: true };
    }
    // Without transactions, partial writes are possible: clean up deliberately.
    await cleanupFailedOrder(orderId, items, priced.coupon?.id);
    throw e;
  }
  await recordHistory(order, 'payment', undefined, order.paymentStatus, { type: 'system' }, 'Order placed');
  await recordHistory(order, 'fulfilment', undefined, order.fulfilmentStatus, { type: 'system' }, isCod ? 'Cash on delivery: confirmed automatically' : 'Order placed');
  if (isCod) {
    // COD has no payment to verify: commit the reserved stock now and tell the customer the order is confirmed.
    await commitOrderInventory(order);
    void notify('order_confirmed', order.customer.email, { orderNumber }, order._id);
  }
  void notify('order_placed', order.customer.email, { orderNumber, currency: order.currency, total: order.total, url: trackingUrl(orderNumber) }, order._id);
  void notifyAdmin('order_placed', { summary: `New order ${orderNumber}` , orderNumber, currency: order.currency, total: order.total, url: `${env.CLIENT_URL}/admin/orders` }, order._id, settings.notifications?.adminEmail);
  return { order, duplicate: false };
}

async function cleanupFailedOrder(orderId: unknown, items: any[], couponId?: unknown) {
  try {
    const existing = await Order.findById(orderId).lean();
    // If the order never persisted, any reserved stock must go back (reserveStock itself compensates its own partial failures).
    if (!existing) {
      const reserved = await (await import('../models/index.js')).InventoryMovement.countDocuments({ order: orderId, reason: 'order_reserved' });
      if (reserved > 0) await releaseStock(items.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, sku: l.sku })), 'reserved', orderId);
    } else {
      await Order.deleteOne({ _id: orderId });
      await PaymentAttempt.deleteMany({ order: orderId });
      await releaseStock(items.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, sku: l.sku })), 'reserved', orderId);
      if (couponId) {
        const u = await CouponUsage.findOneAndDelete({ order: orderId });
        if (u) await Coupon.updateOne({ _id: couponId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
      }
    }
  } catch (e) {
    console.error('cleanup after failed order failed', e);
  }
}

/** Cancels an order, releasing inventory/coupon usage exactly once. */
export async function cancelOrder(order: any, actor: { id?: unknown; type: 'staff' | 'customer' | 'system' }, reason: string) {
  const check = canMoveFulfilment({ ...order.toObject?.() ?? order, paymentType: order.paymentMethodKey === 'cod' ? 'cod' : 'qr' }, 'cancelled');
  if (!check.ok) throw conflict(check.reason, 'INVALID_TRANSITION');
  // Atomic guard against double-cancel / racing release
  const res = await Order.updateOne({ _id: order._id, fulfilmentStatus: { $nin: ['cancelled', 'returned'] }, inventoryState: { $in: ['reserved', 'committed'] } }, { $set: { fulfilmentStatus: 'cancelled', cancelReason: reason, inventoryState: 'released' } });
  if (res.modifiedCount !== 1) throw conflict('This order was already cancelled.', 'ALREADY_CANCELLED');
  const prevState = order.inventoryState as 'reserved' | 'committed';
  await releaseStock(order.items.map((l: any) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, sku: l.sku })), prevState, order._id, actor.id);
  if (prevState === 'committed') for (const l of order.items) await Product.updateOne({ _id: l.productId, soldCount: { $gte: l.quantity } }, { $inc: { soldCount: -l.quantity } });
  const usage: any = await CouponUsage.findOne({ order: order._id, released: false }).lean();
  if (usage) {
    const rel = await CouponUsage.updateOne({ _id: usage._id, released: false }, { $set: { released: true } });
    if (rel.modifiedCount === 1) await Coupon.updateOne({ _id: usage.coupon, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
  }
  await PaymentAttempt.updateMany({ order: order._id, status: { $in: ['awaiting_evidence', 'submitted', 'under_review'] } }, { $set: { status: 'rejected', 'decision.reason': 'Order cancelled', 'decision.at': new Date() } });
  await recordHistory(order, 'fulfilment', order.fulfilmentStatus, 'cancelled', actor, reason);
  void notify('order_cancelled', order.customer.email, { orderNumber: order.orderNumber, reason }, order._id);
}

/** Releases reservations for unpaid, non-COD orders older than the configured window. */
export async function expireStaleOrders(now = new Date()) {
  const s = await getSettings();
  const cutoff = new Date(now.getTime() - (s.reservationHours ?? 48) * 3600_000);
  const stale = await Order.find({ placedAt: { $lt: cutoff }, paymentStatus: { $in: ['awaiting_evidence', 'rejected'] }, fulfilmentStatus: 'awaiting_payment_verification', inventoryState: 'reserved' }).limit(100);
  let n = 0;
  for (const o of stale) {
    try { await cancelOrder(o, { type: 'system' }, 'Payment evidence not received in time'); n++; } catch { /* already handled elsewhere */ }
  }
  return n;
}

export async function commitOrderInventory(order: any) {
  const r = await Order.updateOne({ _id: order._id, inventoryState: 'reserved' }, { $set: { inventoryState: 'committed' } });
  if (r.modifiedCount === 1) await commitStock(order.items.map((l: any) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, sku: l.sku })));
}

export { canMovePayment };
export { escapeRegex, Category, User };