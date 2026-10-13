import { describe, expect, it } from 'vitest';
import { computeTotals, unitPrice } from '../src/services/pricing.js';
import { evaluateCoupon } from '../src/services/coupons.js';
import { quoteShipping } from '../src/services/shipping.js';
import { canMoveFulfilment, canMovePayment } from '../src/services/stateMachine.js';
import { detectImageType, validateImageUpload } from '../src/services/storage.js';
import { summariseMoney } from '../src/services/reportMath.js';
import { toCsv } from '../src/utils/csv.js';
import { addressSchema, checkoutSchema } from '../src/validators/schemas.js';

describe('pricing', () => {
  const p = { price: 4000, salePrice: 3000, inrPrice: 3000, inrSalePrice: null };
  it('uses sale price when active', () => expect(unitPrice(p, undefined, 'NPR')?.unit).toBe(3000));
  it('ignores an expired sale', () => expect(unitPrice({ ...p, saleEnd: new Date('2020-01-01') }, undefined, 'NPR')?.unit).toBe(4000));
  it('ignores a sale that has not started', () => expect(unitPrice({ ...p, saleStart: new Date(Date.now() + 86400000) }, undefined, 'NPR')?.unit).toBe(4000));
  it('ignores a "sale" price above list price', () => expect(unitPrice({ price: 100, salePrice: 150 }, undefined, 'NPR')?.unit).toBe(100));
  it('variant price overrides product price', () => expect(unitPrice(p, { price: 5000 }, 'NPR')?.unit).toBe(3000 /* product sale applies only if lower than list */ ));
  it('refuses INR when no INR price is configured', () => expect(unitPrice({ price: 100 }, undefined, 'INR')).toBeNull());
  it('computes totals without mixing shipping into discount', () => {
    const t = computeTotals({ lines: [{ unit: 1000, quantity: 2 }, { unit: 500.5, quantity: 1 }], discount: 250, shipping: 100 });
    expect(t).toMatchObject({ subtotal: 2500.5, discount: 250, shipping: 100, total: 2350.5 });
  });
  it('caps discount at subtotal and never goes negative', () => expect(computeTotals({ lines: [{ unit: 100, quantity: 1 }], discount: 999, shipping: 0 }).total).toBe(0));
  it('adds tax only when prices exclude it', () => {
    expect(computeTotals({ lines: [{ unit: 1000, quantity: 1 }], discount: 0, shipping: 0, taxEnabled: true, taxRatePercent: 13, pricesIncludeTax: false }).total).toBe(1130);
    expect(computeTotals({ lines: [{ unit: 1130, quantity: 1 }], discount: 0, shipping: 0, taxEnabled: true, taxRatePercent: 13, pricesIncludeTax: true })).toMatchObject({ total: 1130, tax: 130 });
  });
});

describe('coupons', () => {
  const ctx = { currency: 'NPR' as const, subtotal: 5000, customerUsageCount: 0, isFirstOrder: true, lines: [{ productId: 'a', categoryIds: ['c1'], lineTotal: 3000 }, { productId: 'b', categoryIds: ['c2'], lineTotal: 2000 }] };
  const base = { code: 'X', type: 'percentage' as const, value: 10 };
  it('applies percentage', () => expect(evaluateCoupon(base, ctx)).toEqual({ ok: true, discount: 500, freeShipping: false }));
  it('respects max discount', () => expect(evaluateCoupon({ ...base, maxDiscount: 200 }, ctx)).toMatchObject({ ok: true, discount: 200 }));
  it('rejects unknown / inactive', () => { expect(evaluateCoupon(null, ctx).ok).toBe(false); expect(evaluateCoupon({ ...base, active: false }, ctx).ok).toBe(false); });
  it('rejects expired and not-yet-started', () => {
    expect(evaluateCoupon({ ...base, endsAt: new Date('2020-01-01') }, ctx).ok).toBe(false);
    expect(evaluateCoupon({ ...base, startsAt: new Date(Date.now() + 1e9) }, ctx).ok).toBe(false);
  });
  it('enforces min order, usage limit, per-customer limit, first order', () => {
    expect(evaluateCoupon({ ...base, minOrder: 9000 }, ctx).ok).toBe(false);
    expect(evaluateCoupon({ ...base, usageLimit: 5, usedCount: 5 }, ctx).ok).toBe(false);
    expect(evaluateCoupon({ ...base, perCustomerLimit: 1 }, { ...ctx, customerUsageCount: 1 }).ok).toBe(false);
    expect(evaluateCoupon({ ...base, firstOrderOnly: true }, { ...ctx, isFirstOrder: false }).ok).toBe(false);
  });
  it('scopes to category/product', () => {
    expect(evaluateCoupon({ ...base, categoryIds: ['c2'] }, ctx)).toMatchObject({ ok: true, discount: 200 });
    expect(evaluateCoupon({ ...base, productIds: ['zzz'] }, ctx).ok).toBe(false);
  });
  it('fixed coupon cannot exceed eligible total; wrong currency rejected', () => {
    expect(evaluateCoupon({ code: 'F', type: 'fixed', value: 99999 }, ctx)).toMatchObject({ discount: 5000 });
    expect(evaluateCoupon({ code: 'F', type: 'fixed', value: 100, currency: 'INR' }, ctx).ok).toBe(false);
  });
  it('free shipping coupon flags shipping only', () => expect(evaluateCoupon({ code: 'S', type: 'free_shipping', value: 0 }, ctx)).toEqual({ ok: true, discount: 0, freeShipping: true }));
});

describe('shipping', () => {
  const zones: any[] = [
    { _id: 'z1', name: 'Kathmandu', country: 'NP', cities: ['Kathmandu'], districts: [], currency: 'NPR', freeShippingAll: true, methods: [{ _id: 'm1', name: 'Std', charge: 0, estimatedDays: '2–3 days', codAllowed: true }] },
    { _id: 'z2', name: 'Nepal', country: 'NP', cities: [], districts: [], currency: 'NPR', sortOrder: 5, methods: [{ _id: 'm2', name: 'Courier', charge: 250, freeThreshold: 10000, estimatedDays: '4–6 days' }] },
  ];
  const q = (o: any) => quoteShipping({ zones, country: 'NP', city: 'Kathmandu', currency: 'NPR', subtotal: 1000, ...o });
  it('is free in Kathmandu (case-insensitive)', () => expect(q({ city: ' kathmandu ' })).toMatchObject({ ok: true, charge: 0, isFree: true, estimatedDays: '2–3 days' }));
  it('charges elsewhere and applies thresholds', () => {
    expect(q({ city: 'Pokhara' })).toMatchObject({ charge: 250, isFree: false });
    expect(q({ city: 'Pokhara', subtotal: 12000 })).toMatchObject({ charge: 0, isFree: true });
    expect(q({ city: 'Pokhara', couponFreeShipping: true })).toMatchObject({ charge: 0 });
  });
  it('rejects unsupported countries and currencies', () => {
    expect(q({ country: 'US' }).ok).toBe(false);
    expect(q({ currency: 'INR' }).ok).toBe(false);
  });
  it('honours product delivery restrictions', () => expect(q({ restrictedKeys: ['Kathmandu'] }).ok).toBe(false));
  it('ignores inactive zones', () => expect(quoteShipping({ zones: zones.map((z) => ({ ...z, active: false })), country: 'NP', city: 'Kathmandu', currency: 'NPR', subtotal: 1 }).ok).toBe(false));
});

describe('order state machine', () => {
  const o = (f: any, p: any, type: any = 'qr') => ({ fulfilmentStatus: f, paymentStatus: p, paymentMethodKey: 'esewa', paymentType: type });
  it('blocks fulfilment of unpaid QR orders', () => {
    expect(canMoveFulfilment(o('awaiting_payment_verification', 'submitted'), 'confirmed').ok).toBe(false);
    expect(canMoveFulfilment(o('awaiting_payment_verification', 'paid'), 'confirmed').ok).toBe(true);
  });
  it('allows COD to be confirmed without payment', () => expect(canMoveFulfilment(o('awaiting_payment_verification', 'unpaid', 'cod'), 'confirmed').ok).toBe(true));
  it('rejects skipping steps and leaving terminal states', () => {
    expect(canMoveFulfilment(o('confirmed', 'paid'), 'delivered').ok).toBe(false);
    expect(canMoveFulfilment(o('cancelled', 'paid'), 'confirmed').ok).toBe(false);
  });
  it('allows cancelling an unpaid order', () => expect(canMoveFulfilment(o('awaiting_payment_verification', 'rejected'), 'cancelled').ok).toBe(true));
  it('payment transitions', () => {
    expect(canMovePayment('awaiting_evidence', 'paid').ok).toBe(false);
    expect(canMovePayment('submitted', 'paid').ok).toBe(true);
    expect(canMovePayment('rejected', 'submitted').ok).toBe(true);
    expect(canMovePayment('refunded', 'paid').ok).toBe(false);
  });
});

describe('uploads', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  it('detects real image types from bytes', () => {
    expect(detectImageType(png)).toBe('image/png');
    expect(detectImageType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]))).toBe('image/jpeg');
    expect(detectImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]))).toBe('image/webp');
  });
  it('rejects scripts renamed as images, and oversize files', () => {
    expect(() => validateImageUpload({ buffer: Buffer.from('<script>alert(1)</script>'.padEnd(40)), size: 40 })).toThrow(/JPG, PNG or WebP/);
    expect(() => validateImageUpload({ buffer: png, size: 6 * 1024 * 1024 }, 5)).toThrow(/too large/);
    expect(() => validateImageUpload(undefined)).toThrow();
  });
});

describe('csv + validation', () => {
  it('neutralises spreadsheet formulas and quotes cells', () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: 'hello, world' }], ['a', 'b']);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"hello, world"');
  });
  it('validates addresses by country', () => {
    expect(addressSchema.safeParse({ country: 'NP', city: 'Kathmandu', street: 'Devkota Marg' }).success).toBe(false); // district required
    expect(addressSchema.safeParse({ country: 'NP', city: 'Kathmandu', district: 'Kathmandu', street: 'Devkota Marg' }).success).toBe(true);
    expect(addressSchema.safeParse({ country: 'IN', city: 'Delhi', street: 'Main road', region: 'Delhi', postalCode: '110001' }).success).toBe(true);
    expect(addressSchema.safeParse({ country: 'IN', city: 'Delhi', street: 'Main road', region: 'Delhi', postalCode: '1100' }).success).toBe(false);
  });
  it('requires terms acceptance at checkout', () => {
    const base: any = { customer: { firstName: 'A', lastName: 'B', email: 'a@b.co', phone: '+977 9800000000' }, shippingAddress: { country: 'NP', city: 'Kathmandu', district: 'Kathmandu', street: 'Devkota Marg' }, items: [{ productId: 'a'.repeat(24), quantity: 1 }], currency: 'NPR', paymentMethodKey: 'esewa' };
    expect(checkoutSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...base, acceptTerms: true }).success).toBe(true);
  });
});

describe('dashboard money maths', () => {
  const row = (c: string, p: string, n: number, total: number, shipping = 0, discount = 0, refunded = 0) => ({ _id: { c, p }, n, total, shipping, discount, refunded });
  const out = summariseMoney([
    row('NPR', 'paid', 2, 9000, 0, 500), row('NPR', 'refunded', 1, 3000, 300, 0, 3000), row('NPR', 'submitted', 1, 2000), row('NPR', 'awaiting_evidence', 1, 1000), row('NPR', 'rejected', 1, 500),
    row('INR', 'paid', 1, 1500, 100),
  ]);
  const npr = out.find((m) => m.currency === 'NPR')!, inr = out.find((m) => m.currency === 'INR')!;
  it('counts only verified payments as receipts and keeps unverified value separate', () => {
    expect(npr.verifiedReceipts).toBe(12000); expect(npr.unverifiedValue).toBe(3500); expect(npr.gross).toBe(15500);
  });
  it('subtracts refunds and shipping from net, and computes average order value', () => {
    expect(npr.refunds).toBe(3000); expect(npr.net).toBe(8700); expect(npr.orders).toBe(6); expect(npr.averageOrderValue).toBe(2583.33);
    expect(npr.discountsGiven).toBe(500);
  });
  it('never merges currencies', () => { expect(out).toHaveLength(2); expect(inr.gross).toBe(1500); expect(inr.net).toBe(1400); });
});
