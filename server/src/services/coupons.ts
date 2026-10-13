import { round2 } from '../utils/helpers.js';
import type { Currency } from './pricing.js';

export interface CouponLike {
  code: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  currency?: Currency;
  minOrder?: number | null;
  maxDiscount?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  firstOrderOnly?: boolean;
  productIds?: unknown[];
  categoryIds?: unknown[];
  usedCount?: number;
  active?: boolean;
}
export interface CouponContext {
  currency: Currency;
  subtotal: number;
  lines: { productId: string; categoryIds: string[]; lineTotal: number }[];
  now?: Date;
  customerUsageCount: number;
  isFirstOrder: boolean;
}
export type CouponResult = { ok: true; discount: number; freeShipping: boolean } | { ok: false; reason: string };

const str = (x: unknown) => String(x);

export function evaluateCoupon(c: CouponLike | null | undefined, ctx: CouponContext): CouponResult {
  const now = ctx.now ?? new Date();
  if (!c || c.active === false) return { ok: false, reason: 'This coupon code is not valid.' };
  if (c.startsAt && now < new Date(c.startsAt)) return { ok: false, reason: 'This coupon is not active yet.' };
  if (c.endsAt && now > new Date(c.endsAt)) return { ok: false, reason: 'This coupon has expired.' };
  if (c.usageLimit != null && (c.usedCount ?? 0) >= c.usageLimit) return { ok: false, reason: 'This coupon has reached its usage limit.' };
  if (c.perCustomerLimit != null && ctx.customerUsageCount >= c.perCustomerLimit) return { ok: false, reason: 'You have already used this coupon the maximum number of times.' };
  if (c.firstOrderOnly && !ctx.isFirstOrder) return { ok: false, reason: 'This coupon is only valid on a first order.' };
  if (c.type !== 'free_shipping' && c.currency && c.currency !== ctx.currency) return { ok: false, reason: `This coupon is only valid for ${c.currency} orders.` };
  if (c.minOrder != null && ctx.subtotal < c.minOrder) return { ok: false, reason: `Spend at least ${c.minOrder} to use this coupon.` };

  const products = (c.productIds ?? []).map(str);
  const cats = (c.categoryIds ?? []).map(str);
  const scoped = products.length > 0 || cats.length > 0;
  const eligible = scoped
    ? ctx.lines.filter((l) => products.includes(l.productId) || l.categoryIds.some((id) => cats.includes(id)))
    : ctx.lines;
  const base = round2(eligible.reduce((s, l) => s + l.lineTotal, 0));
  if (scoped && base <= 0) return { ok: false, reason: 'This coupon does not apply to the items in your cart.' };

  if (c.type === 'free_shipping') return { ok: true, discount: 0, freeShipping: true };
  let discount = c.type === 'percentage' ? (base * Math.min(c.value, 100)) / 100 : c.value;
  if (c.maxDiscount != null) discount = Math.min(discount, c.maxDiscount);
  discount = round2(Math.min(discount, base));
  if (discount <= 0) return { ok: false, reason: 'This coupon gives no discount on your cart.' };
  return { ok: true, discount, freeShipping: false };
}
