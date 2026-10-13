import { round2 } from '../utils/helpers.js';

export const PAID = ['paid', 'refund_pending', 'partially_refunded', 'refunded'];
export const UNVERIFIED = ['awaiting_evidence', 'unpaid', 'submitted', 'under_review', 'rejected'];

export interface SalesRow { _id: { c: string; p: string }; n: number; total: number; shipping: number; discount: number; refunded: number }

/**
 * Turns per-(currency, paymentStatus) aggregates into per-currency financial summaries.
 * - gross: value of all non-cancelled orders
 * - verifiedReceipts: orders whose payment was verified by staff (never just "evidence uploaded")
 * - unverifiedValue: orders still awaiting / failing verification
 * - net: verified receipts minus refunds and shipping collected
 * Currencies are never merged.
 */
export function summariseMoney(rows: SalesRow[]) {
  const money: Record<string, any> = {};
  for (const r of rows) {
    const c = r._id.c;
    const m = (money[c] ??= { currency: c, gross: 0, orders: 0, verifiedReceipts: 0, unverifiedValue: 0, refunds: 0, shippingCollected: 0, discountsGiven: 0, net: 0, averageOrderValue: 0 });
    m.gross = round2(m.gross + r.total);
    m.orders += r.n;
    m.discountsGiven = round2(m.discountsGiven + r.discount);
    if (PAID.includes(r._id.p)) {
      m.verifiedReceipts = round2(m.verifiedReceipts + r.total);
      m.shippingCollected = round2(m.shippingCollected + r.shipping);
      m.refunds = round2(m.refunds + r.refunded);
    } else if (UNVERIFIED.includes(r._id.p)) m.unverifiedValue = round2(m.unverifiedValue + r.total);
  }
  for (const m of Object.values(money)) {
    m.net = round2(m.verifiedReceipts - m.refunds - m.shippingCollected);
    m.averageOrderValue = m.orders ? round2(m.gross / m.orders) : 0;
  }
  return Object.values(money);
}
