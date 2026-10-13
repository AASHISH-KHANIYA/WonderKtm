import { Router } from 'express';
import { Category, Coupon, CouponUsage, Order, PaymentAttempt, Product, User } from '../models/index.js';
import { requireStaff } from '../middleware/auth.js';
import { asyncHandler, round2 } from '../utils/helpers.js';
import { getSettings } from '../services/settings.js';
import { toCsv } from '../utils/csv.js';
import { PAID, summariseMoney } from '../services/reportMath.js';
import { audit } from '../services/audit.js';

export const adminReportsRouter = Router();
adminReportsRouter.use(requireStaff);


function range(q: Record<string, string>) {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 86400_000);
  return { from, to };
}

/** All money figures are grouped per currency. NPR and INR are never summed together. */
adminReportsRouter.get('/dashboard', asyncHandler(async (req, res) => {
  const role = req.user!.role;
  const finance = role === 'owner' || role === 'order_manager';
  const { from, to } = range(req.query as any);
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - ((startOfDay.getDay() + 6) % 7));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const settings = await getSettings();
  const inRange = { placedAt: { $gte: from, $lte: to } };
  const live = { fulfilmentStatus: { $nin: ['cancelled'] } };

  const products: any[] = await Product.find({ status: { $ne: 'archived' } }).select('name sku stock lowStockThreshold variants status').lean();
  let low = 0, out = 0;
  for (const p of products) {
    const th = p.lowStockThreshold ?? settings.lowStockThreshold;
    const units = p.variants?.length ? p.variants.filter((v: any) => v.active !== false) : [{ stock: p.stock }];
    for (const u of units) { if (u.stock <= 0) out++; else if (u.stock <= (u.lowStockThreshold ?? th)) low++; }
  }
  const inventory = { activeProducts: products.filter((p) => p.status === 'published').length, lowStock: low, outOfStock: out };
  if (!finance) return res.json({ role, inventory, range: { from, to } });

  const [total, today, week, month, byFulfil, byPay, sales, daily, customers, newCustomers, repeat, topProducts, topCats, couponStats, recentOrders, recentActivity, pendingVerification] = await Promise.all([
    Order.countDocuments({}), Order.countDocuments({ placedAt: { $gte: startOfDay } }), Order.countDocuments({ placedAt: { $gte: startOfWeek } }), Order.countDocuments({ placedAt: { $gte: startOfMonth } }),
    Order.aggregate([{ $match: inRange }, { $group: { _id: '$fulfilmentStatus', n: { $sum: 1 } } }]),
    Order.aggregate([{ $match: inRange }, { $group: { _id: '$paymentStatus', n: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { ...inRange, ...live } },
      { $group: { _id: { c: '$currency', p: '$paymentStatus' }, n: { $sum: 1 }, total: { $sum: '$total' }, shipping: { $sum: '$shippingTotal' }, discount: { $sum: '$discountTotal' }, refunded: { $sum: '$refundedAmount' } } },
    ]),
    Order.aggregate([{ $match: { ...inRange, ...live } }, { $project: { c: '$currency', day: { $dateToString: { format: '%Y-%m-%d', date: '$placedAt' } }, total: 1, paid: { $in: ['$paymentStatus', PAID] } } }, { $group: { _id: { c: '$c', d: '$day' }, orders: { $sum: 1 }, value: { $sum: '$total' } } }, { $sort: { '_id.d': 1 } }]).catch(() => []),
    User.countDocuments({ role: 'customer' }), User.countDocuments({ role: 'customer', createdAt: { $gte: from, $lte: to } }),
    Order.aggregate([{ $match: live }, { $group: { _id: '$customer.email', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $count: 'repeat' }]),
    Order.aggregate([{ $match: { ...inRange, ...live } }, { $unwind: '$items' }, { $group: { _id: { p: '$items.productId', c: '$currency', n: '$items.name' }, qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } }, { $sort: { qty: -1 } }, { $limit: 5 }]),
    Order.aggregate([{ $match: { ...inRange, ...live } }, { $unwind: '$items' }, { $group: { _id: { k: '$items.categoryId', c: '$currency' }, qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } }, { $sort: { revenue: -1 } }, { $limit: 6 }]),
    CouponUsage.aggregate([{ $match: { released: false, createdAt: { $gte: from, $lte: to } } }, { $group: { _id: '$coupon', uses: { $sum: 1 }, discount: { $sum: '$discount' } } }, { $sort: { uses: -1 } }, { $limit: 5 }]),
    Order.find({}).sort({ placedAt: -1 }).limit(8).select('orderNumber placedAt total currency paymentStatus fulfilmentStatus customer.firstName customer.lastName').lean(),
    role === 'owner' ? (await import('../models/index.js')).AuditLog.find({}).sort({ at: -1 }).limit(8).lean() : [],
    PaymentAttempt.countDocuments({ status: { $in: ['submitted', 'under_review'] } }),
  ]);

  const money = summariseMoney(sales as any);

  const f = Object.fromEntries((byFulfil as any[]).map((x) => [x._id, x.n])); const p = Object.fromEntries((byPay as any[]).map((x) => [x._id, x.n]));
  const catNames = new Map((await Category.find({ _id: { $in: (topCats as any[]).map((c) => c._id.k).filter(Boolean) } }).select('name').lean()).map((c: any) => [String(c._id), c.name]));
  const couponNames = new Map((await Coupon.find({ _id: { $in: (couponStats as any[]).map((c) => c._id) } }).select('code').lean()).map((c: any) => [String(c._id), c.code]));
  res.json({
    role, range: { from, to },
    orders: { total, today, week, month, pending: (f.awaiting_payment_verification ?? 0) + (f.confirmed ?? 0), processing: (f.processing ?? 0) + (f.packed ?? 0), shipped: (f.shipped ?? 0) + (f.out_for_delivery ?? 0), delivered: f.delivered ?? 0, cancelled: f.cancelled ?? 0 },
    payments: { awaitingVerification: pendingVerification, verified: p.paid ?? 0, rejected: p.rejected ?? 0, refunded: (p.refunded ?? 0) + (p.partially_refunded ?? 0) + (p.refund_pending ?? 0) },
    money, dailySeries: (daily as any[]).map((d) => ({ date: d._id.d, currency: d._id.c, orders: d.orders, value: round2(d.value) })),
    customers: { total: customers, new: newCustomers, repeat: (repeat as any[])[0]?.repeat ?? 0 }, inventory,
    topProducts: (topProducts as any[]).map((t) => ({ name: t._id.n, quantity: t.qty, revenue: round2(t.revenue), currency: t._id.c })),
    topCategories: (topCats as any[]).map((t) => ({ name: catNames.get(String(t._id.k)) ?? 'Uncategorised', quantity: t.qty, revenue: round2(t.revenue), currency: t._id.c })),
    coupons: (couponStats as any[]).map((c) => ({ code: couponNames.get(String(c._id)) ?? 'unknown', uses: c.uses, discountGiven: round2(c.discount) })),
    recentOrders, recentActivity,
  });
}));

adminReportsRouter.get('/reports/sales.csv', asyncHandler(async (req, res) => {
  if (!['owner', 'order_manager'].includes(req.user!.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to export sales data.' } });
  const { from, to } = range(req.query as any);
  const rows = await Order.aggregate([{ $match: { placedAt: { $gte: from, $lte: to }, fulfilmentStatus: { $ne: 'cancelled' } } }, { $group: { _id: { c: '$currency', p: '$paymentStatus' }, orders: { $sum: 1 }, total: { $sum: '$total' } } }, { $sort: { '_id.c': 1 } }]);
  await audit(req, 'export.sales', 'Report');
  res.type('text/csv').attachment('sales-summary.csv').send(toCsv(rows.map((r: any) => ({ currency: r._id.c, paymentStatus: r._id.p, orders: r.orders, total: round2(r.total) })), ['currency', 'paymentStatus', 'orders', 'total']));
}));
