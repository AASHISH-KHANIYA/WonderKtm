import { Schema, model, InferSchemaType } from 'mongoose';

export const ROLES = ['customer', 'owner', 'order_manager', 'inventory_manager', 'content_manager'] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: Role[] = ['owner', 'order_manager', 'inventory_manager', 'content_manager'];

const addressSchema = new Schema(
  {
    label: { type: String, default: 'Home', maxlength: 40 },
    recipientName: { type: String, maxlength: 120 },
    phone: { type: String, maxlength: 30 },
    country: { type: String, required: true, maxlength: 2 },
    region: { type: String, maxlength: 80 },
    city: { type: String, required: true, maxlength: 80 },
    district: { type: String, maxlength: 80 },
    street: { type: String, required: true, maxlength: 200 },
    building: { type: String, maxlength: 80 },
    landmark: { type: String, maxlength: 200 },
    postalCode: { type: String, maxlength: 20 },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, trim: true, maxlength: 60, default: '' },
    phone: { type: String, trim: true, maxlength: 30 },
    role: { type: String, enum: ROLES, default: 'customer', index: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    emailVerified: { type: Boolean, default: false },
    verifyTokenHash: { type: String, select: false },
    resetTokenHash: { type: String, select: false },
    resetExpires: { type: Date, select: false },
    tokenVersion: { type: Number, default: 0 },
    addresses: { type: [addressSchema], default: [], validate: (v: unknown[]) => v.length <= 10 },
    marketingConsent: { type: Boolean, default: false },
    internalNotes: {
      type: [{ note: String, by: { type: Schema.Types.ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }],
      default: [],
      select: false,
    },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: any };
export const User = model('User', userSchema);
