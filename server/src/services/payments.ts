import { Order, PaymentAttempt } from '../models/index.js';
import { AppError, conflict } from '../utils/errors.js';
import { notify, notifyAdmin } from './email.js';
import { commitOrderInventory, recordHistory, trackingUrl } from './orders.js';
import { getSettings } from './settings.js';
import { putFile, validateImageUpload } from './storage.js';
import { canMovePayment } from './stateMachine.js';
import { env } from '../config/env.js';

export async function submitEvidence(order: any, file: { buffer: Buffer; size: number; originalname: string } | undefined, body: { transactionRef?: string; payerNote?: string }, actor: { id?: unknown; type: 'customer' | 'staff' }) {
  const method = (await getSettings()).paymentMethods.find((m: any) => m.key === order.paymentMethodKey);
  if (method?.type === 'cod') throw new AppError(400, 'This order is paid on delivery, so no payment evidence is needed.', 'COD_ORDER');
  if (['cancelled', 'returned'].includes(order.fulfilmentStatus)) throw new AppError(409, 'This order has been cancelled.', 'ORDER_CANCELLED');
  if (order.paymentStatus === 'paid') throw new AppError(409, 'Payment for this order was already verified.', 'ALREADY_PAID');

  const settings = await getSettings();
  const mime = validateImageUpload(file, settings.maxUploadMb ?? env.MAX_UPLOAD_MB);
  const stored = await putFile(file!.buffer, mime, { folder: `evidence/${order._id}`, private: true });

  // Reuse the open attempt, or start a new one after a rejection (resubmission).
  let attempt: any = await PaymentAttempt.findOne({ order: order._id, status: { $in: ['awaiting_evidence', 'submitted', 'under_review'] } }).sort({ attemptNo: -1 });
  if (attempt && attempt.status === 'under_review') throw new AppError(409, 'Your payment is being reviewed. Please wait for the result before uploading more.', 'UNDER_REVIEW');
  if (!attempt) {
    const last = await PaymentAttempt.findOne({ order: order._id }).sort({ attemptNo: -1 });
    attempt = new PaymentAttempt({ order: order._id, attemptNo: (last?.attemptNo ?? 0) + 1, methodKey: order.paymentMethodKey, amount: order.total, currency: order.currency });
  }
  if (attempt.evidence.length >= 5) throw new AppError(400, 'You can upload up to 5 files per payment attempt.', 'TOO_MANY_FILES');
  attempt.evidence.push({ storageKey: stored.key, provider: stored.provider, mime, size: file!.size, originalName: String(file!.originalname).slice(0, 120) });
  if (body.transactionRef) attempt.transactionRef = body.transactionRef;
  if (body.payerNote) attempt.payerNote = body.payerNote;
  attempt.status = 'submitted';
  attempt.submittedAt = new Date();
  await attempt.save();

  const from = order.paymentStatus;
  if (from !== 'submitted') {
    const ok = canMovePayment(from, 'submitted');
    if (!ok.ok) throw conflict(ok.reason, 'INVALID_TRANSITION');
    const r = await Order.updateOne({ _id: order._id, paymentStatus: from }, { $set: { paymentStatus: 'submitted' } });
    if (r.modifiedCount === 1) await recordHistory(order, 'payment', from, 'submitted', { type: actor.type, id: actor.id }, 'Payment evidence submitted');
  }
  void notify('payment_submitted', order.customer.email, { orderNumber: order.orderNumber }, order._id);
  void notifyAdmin('payment_submitted', { summary: `Payment evidence for ${order.orderNumber}`, orderNumber: order.orderNumber }, order._id, settings.notifications?.adminEmail);
  return attempt;
}

export async function startReview(attemptId: string, staffId: unknown) {
  const claimed = await PaymentAttempt.updateOne({ _id: attemptId, status: 'submitted' }, { $set: { status: 'under_review' } });
  if (claimed.modifiedCount !== 1) throw conflict('This payment is not waiting for review.', 'NOT_REVIEWABLE');
  const attempt: any = await PaymentAttempt.findById(attemptId);
  const r = await Order.updateOne({ _id: attempt.order, paymentStatus: 'submitted' }, { $set: { paymentStatus: 'under_review' } });
  if (r.modifiedCount === 1) await recordHistory(attempt.order, 'payment', 'submitted', 'under_review', { type: 'staff', id: staffId }, 'Review started');
  return attempt;
}

/** Approve requires an explicit attestation that real funds were received. The atomic status guard prevents double decisions. */
export async function approvePayment(attemptId: string, staff: { _id: unknown }, fundsConfirmed: boolean) {
  if (fundsConfirmed !== true) throw new AppError(400, 'Confirm that the money has actually reached the merchant account before approving.', 'FUNDS_NOT_CONFIRMED');
  // Atomic claim: only one concurrent decision can flip the status away from submitted/under_review.
  const claimed = await PaymentAttempt.updateOne(
    { _id: attemptId, status: { $in: ['submitted', 'under_review'] } },
    { $set: { status: 'approved', decision: { by: staff._id, at: new Date(), action: 'approved', fundsConfirmed: true } } }
  );
  if (claimed.modifiedCount !== 1) throw conflict('This payment has already been decided or is not awaiting review.', 'ALREADY_DECIDED');
  const attempt: any = await PaymentAttempt.findById(attemptId);
  const order: any = await Order.findById(attempt.order);
  if (!order || ['cancelled', 'returned'].includes(order.fulfilmentStatus)) {
    await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { status: 'submitted' }, $unset: { decision: 1 } });
    throw conflict('The order is cancelled; payment cannot be approved.', 'ORDER_CANCELLED');
  }
  if (attempt.amount !== order.total || attempt.currency !== order.currency) throw new AppError(409, 'Payment amount or currency does not match the order.', 'AMOUNT_MISMATCH');
  const from = order.paymentStatus;
  await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: 'paid' } });
  await recordHistory(order, 'payment', from, 'paid', { type: 'staff', id: staff._id }, 'Payment verified by staff');
  if (order.fulfilmentStatus === 'awaiting_payment_verification') {
    await Order.updateOne({ _id: order._id }, { $set: { fulfilmentStatus: 'confirmed' } });
    await recordHistory(order, 'fulfilment', 'awaiting_payment_verification', 'confirmed', { type: 'staff', id: staff._id }, 'Confirmed after payment verification');
  }
  await commitOrderInventory(order);
  void notify('payment_approved', order.customer.email, { orderNumber: order.orderNumber, url: trackingUrl(order.orderNumber) }, order._id);
  return attempt;
}

export async function rejectPayment(attemptId: string, staff: { _id: unknown }, reason: string) {
  if (!reason || reason.trim().length < 3) throw new AppError(400, 'A reason is required when rejecting a payment.', 'REASON_REQUIRED');
  const claimed = await PaymentAttempt.updateOne(
    { _id: attemptId, status: { $in: ['submitted', 'under_review'] } },
    { $set: { status: 'rejected', decision: { by: staff._id, at: new Date(), action: 'rejected', reason: reason.trim() } } }
  );
  if (claimed.modifiedCount !== 1) throw conflict('This payment has already been decided or is not awaiting review.', 'ALREADY_DECIDED');
  const attempt: any = await PaymentAttempt.findById(attemptId);
  const order: any = await Order.findById(attempt.order);
  const from = order.paymentStatus;
  await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: 'rejected' } });
  await recordHistory(order, 'payment', from, 'rejected', { type: 'staff', id: staff._id }, reason.trim());
  void notify('payment_rejected', order.customer.email, { orderNumber: order.orderNumber, reason: reason.trim(), url: trackingUrl(order.orderNumber) }, order._id);
  return attempt;
}
