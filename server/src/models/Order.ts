import { Schema, model } from 'mongoose';

export const PAYMENT_STATUSES = ['unpaid', 'awaiting_evidence', 'submitted', 'under_review', 'paid', 'rejected', 'refund_pending', 'partially_refunded', 'refunded'] as const;
export const FULFILMENT_STATUSES = [
  'awaiting_payment_verification', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered',
  'cancellation_requested', 'cancelled', 'return_requested', 'returned',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type FulfilmentStatus = (typeof FULFILMENT_STATUSES)[number];

const addressSchema = new Schema(
  {
    country: { type: String, required: true },
    region: String,
    city: { type: String, required: true },
    district: String,
    street: { type: String, required: true },
    building: String,
    landmark: String,
    postalCode: String,
    instructions: String,
  },
  { _id: false }
);

const itemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: Schema.Types.ObjectId,
    name: { type: String, required: true },
    variantLabel: String,
    sku: String,
    image: String,
    unitPrice: { type: Number, required: true },
    listPrice: Number,
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true },
    categoryId: Schema.Types.ObjectId,
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    customer: {
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      email: { type: String, required: true, lowercase: true, index: true },
      phone: { type: String, required: true },
    },
    recipient: { name: String, phone: String },
    shippingAddress: { type: addressSchema, required: true },
    billingAddress: addressSchema,
    items: { type: [itemSchema], validate: (v: unknown[]) => v.length > 0 && v.length <= 50 },
    currency: { type: String, enum: ['NPR', 'INR'], required: true },
    subtotal: { type: Number, required: true },
    discountTotal: { type: Number, default: 0 },
    shippingTotal: { type: Number, default: 0 },
    total: { type: Number, required: true },
    coupon: { code: String, couponId: Schema.Types.ObjectId, discount: Number, freeShipping: Boolean },
    shipping: { zoneName: String, methodName: String, estimatedDays: String, isFree: Boolean },
    paymentMethodKey: { type: String, required: true },
    paymentMethodLabel: String,
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'awaiting_evidence', index: true },
    fulfilmentStatus: { type: String, enum: FULFILMENT_STATUSES, default: 'awaiting_payment_verification', index: true },
    trackingTokenHash: { type: String, required: true, select: false },
    idempotencyKey: { type: String, index: { unique: true, sparse: true } },
    termsAccepted: { version: String, at: Date },
    marketingConsent: { type: Boolean, default: false },
    shipment: { carrier: String, trackingNumber: String, shippedAt: Date, deliveredAt: Date, note: String },
    cancelReason: String,
    customerNote: { type: String, maxlength: 500 },
    inventoryState: { type: String, enum: ['reserved', 'committed', 'released', 'none'], default: 'reserved' },
    taxTotal: { type: Number, default: 0 },
    refundedAmount: { type: Number, default: 0 },
    notes: {
      type: [{ text: String, by: { type: Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }],
      default: [],
      validate: (v: unknown[]) => v.length <= 100,
    },
    placedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);
orderSchema.index({ 'customer.email': 1, placedAt: -1 });
orderSchema.index({ paymentStatus: 1, placedAt: -1 });
export const Order = model('Order', orderSchema);

const evidenceSchema = new Schema(
  { storageKey: { type: String, required: true }, provider: String, mime: String, size: Number, originalName: String, uploadedAt: { type: Date, default: Date.now } },
  { _id: true }
);

const paymentAttemptSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    attemptNo: { type: Number, default: 1 },
    methodKey: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, enum: ['awaiting_evidence', 'submitted', 'under_review', 'approved', 'rejected'], default: 'awaiting_evidence', index: true },
    transactionRef: { type: String, maxlength: 120 },
    payerNote: { type: String, maxlength: 300 },
    evidence: { type: [evidenceSchema], default: [], validate: (v: unknown[]) => v.length <= 5 },
    submittedAt: Date,
    decision: {
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      at: Date,
      action: { type: String, enum: ['approved', 'rejected'] },
      reason: String,
      fundsConfirmed: Boolean,
    },
  },
  { timestamps: true }
);
paymentAttemptSchema.index({ status: 1, submittedAt: -1 });
export const PaymentAttempt = model('PaymentAttempt', paymentAttemptSchema);

export const OrderStatusHistory = model(
  'OrderStatusHistory',
  new Schema(
    {
      order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
      kind: { type: String, enum: ['payment', 'fulfilment'], required: true },
      from: String,
      to: String,
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      actorType: { type: String, enum: ['staff', 'customer', 'system'], default: 'system' },
      note: String,
    },
    { timestamps: { createdAt: 'at', updatedAt: false } }
  )
);
