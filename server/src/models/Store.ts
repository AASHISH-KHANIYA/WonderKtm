import { Schema, model } from 'mongoose';

const money = { type: Number, min: 0 };

const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: String,
    type: { type: String, enum: ['percentage', 'fixed', 'free_shipping'], required: true },
    value: { type: Number, default: 0, min: 0 },
    currency: { type: String, enum: ['NPR', 'INR'], default: 'NPR' }, // for fixed / min / max amounts
    minOrder: money,
    maxDiscount: money,
    startsAt: Date,
    endsAt: Date,
    usageLimit: Number,
    perCustomerLimit: Number,
    firstOrderOnly: { type: Boolean, default: false },
    productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    categoryIds: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    usedCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
export const Coupon = model('Coupon', couponSchema);

export const CouponUsage = model(
  'CouponUsage',
  new Schema(
    {
      coupon: { type: Schema.Types.ObjectId, ref: 'Coupon', index: true },
      order: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
      email: { type: String, index: true },
      user: { type: Schema.Types.ObjectId, ref: 'User' },
      discount: Number,
      released: { type: Boolean, default: false },
    },
    { timestamps: true }
  )
);

const methodSchema = new Schema({ name: String, charge: { type: Number, default: 0 }, freeThreshold: Number, estimatedDays: String, codAllowed: { type: Boolean, default: false } }, { _id: true });
export const ShippingZone = model(
  'ShippingZone',
  new Schema(
    {
      name: { type: String, required: true },
      key: { type: String, required: true, unique: true },
      country: { type: String, required: true },
      cities: { type: [String], default: [] }, // lowercase; empty => whole country (or fallback)
      districts: { type: [String], default: [] },
      currency: { type: String, enum: ['NPR', 'INR'], default: 'NPR' },
      methods: { type: [methodSchema], default: [] },
      freeShippingAll: { type: Boolean, default: false },
      active: { type: Boolean, default: true },
      sortOrder: { type: Number, default: 0 },
    },
    { timestamps: true }
  )
);

export const InventoryMovement = model(
  'InventoryMovement',
  new Schema(
    {
      product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
      variantId: Schema.Types.ObjectId,
      sku: String,
      delta: { type: Number, required: true },
      reason: { type: String, enum: ['order_reserved', 'order_released', 'restock', 'adjustment', 'return', 'initial'], required: true },
      order: { type: Schema.Types.ObjectId, ref: 'Order' },
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      balanceAfter: Number,
      note: String,
    },
    { timestamps: { createdAt: 'at', updatedAt: false } }
  )
);

export const Wishlist = model(
  'Wishlist',
  new Schema(
    { user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, products: { type: [{ type: Schema.Types.ObjectId, ref: 'Product' }], default: [], validate: (v: unknown[]) => v.length <= 200 } },
    { timestamps: true }
  )
);

export const Notification = model(
  'Notification',
  new Schema(
    {
      event: { type: String, required: true, index: true },
      channel: { type: String, enum: ['email', 'admin'], default: 'email' },
      to: String,
      subject: String,
      status: { type: String, enum: ['sent', 'failed', 'skipped_not_configured', 'recorded'], required: true },
      error: String,
      order: { type: Schema.Types.ObjectId, ref: 'Order' },
      readAt: Date,
    },
    { timestamps: true }
  )
);

export const FAQ = model(
  'FAQ',
  new Schema({ question: { type: String, required: true }, answer: { type: String, required: true }, category: String, sortOrder: { type: Number, default: 0 }, published: { type: Boolean, default: true } }, { timestamps: true })
);

/** Key/value JSON blocks: homepage, announcement, about, footer, contact, etc. Draft + published for preview/publish. */
export const WebsiteContent = model(
  'WebsiteContent',
  new Schema(
    {
      key: { type: String, required: true, unique: true },
      draft: { type: Schema.Types.Mixed, default: {} },
      published: { type: Schema.Types.Mixed, default: {} },
      publishedAt: Date,
      updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, minimize: false }
  )
);

export const PolicyVersion = model(
  'PolicyVersion',
  new Schema(
    {
      slug: { type: String, required: true, index: true },
      title: { type: String, required: true },
      body: { type: String, required: true },
      version: { type: Number, required: true },
      effectiveDate: Date,
      status: { type: String, enum: ['draft', 'published', 'unpublished', 'superseded'], default: 'draft' },
      ownerReviewed: { type: Boolean, default: false },
      createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
  )
);
PolicyVersion.schema.index({ slug: 1, version: 1 }, { unique: true });

export const AuditLog = model(
  'AuditLog',
  new Schema(
    {
      actor: { type: Schema.Types.ObjectId, ref: 'User', index: true },
      actorEmail: String,
      action: { type: String, required: true, index: true },
      entity: String,
      entityId: String,
      meta: Schema.Types.Mixed,
      ip: String,
    },
    { timestamps: { createdAt: 'at', updatedAt: false } }
  )
);

export const Counter = model('Counter', new Schema({ _id: String, seq: { type: Number, default: 0 } }));

const paymentMethodSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ['qr', 'cod'], default: 'qr' },
    countries: { type: [String], default: ['NP'] },
    currency: { type: String, enum: ['NPR', 'INR'], default: 'NPR' },
    qrImageUrl: String,
    qrPublicId: String,
    instructions: { type: String, default: '' },
    merchantInfo: { type: String, default: '' },
    minOrder: Number,
    maxOrder: Number,
    active: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { _id: false }
);

export const StoreSettings = model(
  'StoreSettings',
  new Schema(
    {
      key: { type: String, default: 'main', unique: true },
      business: {
        name: { type: String, default: 'Wonderktm' },
        tagline: { type: String, default: 'Discover Delight Repeat.' },
        address: { type: String, default: 'Devkota Marg, Dillibazar, Kathmandu, Bagmati Province, Nepal' },
        email: { type: String, default: '' },
        phone: { type: String, default: '' },
        whatsapp: { type: String, default: '' },
        hours: { type: String, default: 'Online 24/7' },
        logoUrl: String,
        faviconUrl: String,
        social: { type: Map, of: String, default: {} },
      },
      currencies: { type: [String], default: ['NPR'] },
      countries: { type: [String], default: ['NP'] },
      paymentMethods: { type: [paymentMethodSchema], default: [] },
      orderPrefix: { type: String, default: 'WK' },
      lowStockThreshold: { type: Number, default: 5 },
      maxUploadMb: { type: Number, default: 5 },
      reservationHours: { type: Number, default: 48 },
      tax: { enabled: { type: Boolean, default: false }, label: { type: String, default: 'VAT' }, ratePercent: { type: Number, default: 0 }, pricesIncludeTax: { type: Boolean, default: true } },
      notifications: { adminEmail: String, lowStockAlerts: { type: Boolean, default: true } },
      maintenanceMode: { type: Boolean, default: false },
      maintenanceMessage: { type: String, default: 'We are making improvements and will be back shortly.' },
      seoDefaults: { title: { type: String, default: 'Wonderktm — Discover Delight Repeat.' }, description: { type: String, default: 'Home décor, gifts and lifestyle products delivered from Kathmandu.' }, ogImage: String },
      termsVersion: { type: String, default: '0' },
      theme: { type: Map, of: String, default: {} },
    },
    { timestamps: true, minimize: false }
  )
);

// Image bytes for STORAGE_DRIVER=mongo. Kept in its own collection so catalog queries never load file data.
export const FileBlob = model(
  'FileBlob',
  new Schema(
    {
      data: { type: Buffer, required: true },
      mime: { type: String, required: true },
      size: Number,
      folder: String,
      private: { type: Boolean, default: false },
    },
    { timestamps: true }
  )
);
