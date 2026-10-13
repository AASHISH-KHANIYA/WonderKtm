import type { FulfilmentStatus, PaymentStatus } from '../models/Order.js';

export const FULFILMENT_TRANSITIONS: Record<FulfilmentStatus, FulfilmentStatus[]> = {
  awaiting_payment_verification: ['confirmed', 'cancelled', 'cancellation_requested'],
  confirmed: ['processing', 'cancelled', 'cancellation_requested'],
  processing: ['packed', 'cancelled', 'cancellation_requested'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: ['return_requested'],
  cancellation_requested: ['cancelled', 'confirmed', 'processing'],
  return_requested: ['returned', 'delivered'],
  cancelled: [],
  returned: [],
};

export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  unpaid: ['submitted', 'paid', 'refund_pending'],
  awaiting_evidence: ['submitted'],
  submitted: ['under_review', 'paid', 'rejected'],
  under_review: ['paid', 'rejected'],
  paid: ['refund_pending'],
  rejected: ['submitted'],
  refund_pending: ['partially_refunded', 'refunded', 'paid'],
  partially_refunded: ['refunded', 'refund_pending'],
  refunded: [],
};

const NEEDS_PAYMENT: FulfilmentStatus[] = ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

export type Check = { ok: true } | { ok: false; reason: string };

export function canMoveFulfilment(order: { fulfilmentStatus: FulfilmentStatus; paymentStatus: PaymentStatus; paymentMethodKey: string; paymentType?: 'qr' | 'cod' }, to: FulfilmentStatus): Check {
  if (!FULFILMENT_TRANSITIONS[order.fulfilmentStatus]?.includes(to)) return { ok: false, reason: `Cannot move an order from "${order.fulfilmentStatus}" to "${to}".` };
  const isCod = order.paymentType === 'cod';
  if (NEEDS_PAYMENT.includes(to) && order.paymentStatus !== 'paid' && !isCod) {
    return { ok: false, reason: 'Payment must be verified before this order can be fulfilled.' };
  }
  return { ok: true };
}

export function canMovePayment(from: PaymentStatus, to: PaymentStatus): Check {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ? { ok: true } : { ok: false, reason: `Cannot move payment from "${from}" to "${to}".` };
}
