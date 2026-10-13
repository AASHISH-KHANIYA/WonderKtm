import { PaymentAttempt, OrderStatusHistory } from '../models/index.js';
import { getSettings } from './settings.js';
import { saleActive } from './pricing.js';

export function publicProduct(p: any, currency: 'NPR' | 'INR' = 'NPR') {
  const variants = (p.variants ?? []).filter((v: any) => v.active !== false);
  const hasVariants = variants.length > 0;
  const onSaleNow = p.salePrice != null && p.salePrice < p.price && saleActive(p);
  const pricesNpr = hasVariants ? variants.map((v: any) => (v.salePrice != null && v.salePrice < (v.price ?? p.price) && saleActive(p) ? v.salePrice : v.price ?? p.price)) : [onSaleNow ? p.salePrice : p.price];
  const totalStock = hasVariants ? variants.reduce((s: number, v: any) => s + v.stock, 0) : p.stock;
  return {
    id: String(p._id), name: p.name, slug: p.slug, sku: p.sku, shortDescription: p.shortDescription, description: p.description,
    category: p.category && p.category._id ? { id: String(p.category._id), name: p.category.name, slug: p.category.slug } : p.category ? String(p.category) : null,
    subcategory: p.subcategory && p.subcategory._id ? { id: String(p.subcategory._id), name: p.subcategory.name, slug: p.subcategory.slug } : null,
    images: (p.images ?? []).map((i: any) => ({ id: String(i._id), url: i.url, alt: i.alt || p.name, isPrimary: i.isPrimary })),
    price: p.price, salePrice: onSaleNow ? p.salePrice : null, onSale: onSaleNow || (hasVariants && variants.some((v: any) => v.salePrice != null && saleActive(p))),
    priceFrom: Math.min(...pricesNpr), priceTo: Math.max(...pricesNpr), inrPrice: p.inrPrice ?? null, inrSalePrice: p.inrSalePrice ?? null,
    stock: totalStock, inStock: totalStock > 0, lowStock: totalStock > 0 && totalStock <= (p.lowStockThreshold ?? 5),
    variants: variants.map((v: any) => ({ id: String(v._id), name: v.name, sku: v.sku, options: v.options instanceof Map ? Object.fromEntries(v.options) : v.options ?? {}, price: v.price ?? p.price, salePrice: v.salePrice ?? null, inrPrice: v.inrPrice ?? p.inrPrice ?? null, stock: v.stock, inStock: v.stock > 0, imageId: v.imageId })),
    dimensions: p.dimensions, materials: p.materials, careInstructions: p.careInstructions, specifications: p.specifications ?? [],
    isFeatured: p.isFeatured, isNewArrival: p.isNewArrival, collections: p.collections, tags: p.tags, seo: p.seo, createdAt: p.createdAt, updatedAt: p.updatedAt,
    _currency: currency,
  };
}

/** What a customer / guest may see about their own order. Never includes internal notes or staff identities. */
export async function customerOrderView(order: any) {
  const settings = await getSettings();
  const method = settings.paymentMethods.find((m: any) => m.key === order.paymentMethodKey);
  const [attempts, history] = await Promise.all([
    PaymentAttempt.find({ order: order._id }).sort({ attemptNo: -1 }).limit(10).lean(),
    OrderStatusHistory.find({ order: order._id }).sort({ at: 1 }).limit(100).lean(),
  ]);
  const latest: any = attempts[0];
  return {
    id: String(order._id), orderNumber: order.orderNumber, placedAt: order.placedAt, customer: order.customer, recipient: order.recipient,
    shippingAddress: order.shippingAddress, items: order.items, currency: order.currency, subtotal: order.subtotal, discountTotal: order.discountTotal,
    shippingTotal: order.shippingTotal, taxTotal: order.taxTotal, total: order.total, coupon: order.coupon ? { code: order.coupon.code, discount: order.coupon.discount } : null,
    shipping: order.shipping, paymentStatus: order.paymentStatus, fulfilmentStatus: order.fulfilmentStatus, shipment: order.shipment, cancelReason: order.cancelReason,
    paymentMethod: method ? { key: method.key, label: method.label, type: method.type, qrImageUrl: method.qrImageUrl, instructions: method.instructions, merchantInfo: method.merchantInfo } : { key: order.paymentMethodKey, label: order.paymentMethodLabel },
    payment: latest ? { attemptNo: latest.attemptNo, status: latest.status, transactionRef: latest.transactionRef, evidenceCount: latest.evidence.length, submittedAt: latest.submittedAt, rejectionReason: latest.decision?.action === 'rejected' ? latest.decision.reason : undefined } : null,
    canUploadEvidence: method?.type !== 'cod' && ['awaiting_evidence', 'rejected', 'submitted'].includes(order.paymentStatus) && !['cancelled', 'returned'].includes(order.fulfilmentStatus),
    history: history.map((h: any) => ({ kind: h.kind, to: h.to, at: h.at, note: h.actorType === 'staff' && h.kind === 'payment' && h.to === 'rejected' ? h.note : h.actorType === 'system' ? h.note : undefined })),
  };
}
