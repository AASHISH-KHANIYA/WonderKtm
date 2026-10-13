import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const str = (max = 200) => z.string().trim().max(max);
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(10, 'Use at least 10 characters').max(128).refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Include letters and numbers');
export const phoneSchema = z.string().trim().regex(/^\+\d{1,3}[\s-]?\d{6,14}$/, 'Enter the number with country code, e.g. +977 98XXXXXXXX');

export const registerSchema = z.object({ email: emailSchema, password: passwordSchema, firstName: str(60).min(1), lastName: str(60).optional().default(''), phone: phoneSchema.optional(), marketingConsent: z.boolean().optional().default(false) });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const forgotSchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ token: z.string().min(10).max(200), password: passwordSchema });
export const profileSchema = z.object({ firstName: str(60).min(1).optional(), lastName: str(60).optional(), phone: phoneSchema.optional(), marketingConsent: z.boolean().optional() });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });

/** Address rules depend on country: Nepal needs district; India needs postal code & state; others need postal code. */
export const addressSchema = z
  .object({
    country: z.string().length(2).toUpperCase(),
    region: str(80).optional(),
    city: str(80).min(1, 'City is required'),
    district: str(80).optional(),
    street: str(200).min(3, 'Street address is required'),
    building: str(80).optional(),
    landmark: str(200).optional(),
    postalCode: str(20).optional(),
    instructions: str(300).optional(),
  })
  .superRefine((a, ctx) => {
    if (a.country === 'NP' && !a.district) ctx.addIssue({ code: 'custom', path: ['district'], message: 'District is required for Nepal' });
    if (a.country === 'IN') {
      if (!a.region) ctx.addIssue({ code: 'custom', path: ['region'], message: 'State is required for India' });
      if (!a.postalCode || !/^\d{6}$/.test(a.postalCode)) ctx.addIssue({ code: 'custom', path: ['postalCode'], message: 'Enter a 6-digit PIN code' });
    }
    if (!['NP', 'IN'].includes(a.country) && !a.postalCode) ctx.addIssue({ code: 'custom', path: ['postalCode'], message: 'Postal code is required' });
  });

export const savedAddressSchema = z.object({ label: str(40).optional(), recipientName: str(120).optional(), phone: phoneSchema.optional(), country: z.string().length(2).toUpperCase(), region: str(80).optional(), city: str(80).min(1), district: str(80).optional(), street: str(200).min(3), building: str(80).optional(), landmark: str(200).optional(), postalCode: str(20).optional(), isDefault: z.boolean().optional() });

export const cartLineSchema = z.object({ productId: objectId, variantId: objectId.optional(), quantity: z.number().int().min(1).max(20) });
export const quoteSchema = z.object({
  items: z.array(cartLineSchema).min(1).max(50),
  currency: z.enum(['NPR', 'INR']),
  country: z.string().length(2).toUpperCase().optional(),
  city: str(80).optional(),
  district: str(80).optional(),
  couponCode: str(40).optional(),
  paymentMethodKey: str(40).optional(),
  email: emailSchema.optional(),
});

export const checkoutSchema = z.object({
  customer: z.object({ firstName: str(60).min(1), lastName: str(60).min(1), email: emailSchema, phone: phoneSchema }),
  recipient: z.object({ name: str(120).optional(), phone: phoneSchema.optional() }).optional(),
  shippingAddress: addressSchema,
  billingSameAsShipping: z.boolean().default(true),
  billingAddress: addressSchema.optional(),
  items: z.array(cartLineSchema).min(1).max(50),
  currency: z.enum(['NPR', 'INR']),
  couponCode: str(40).optional(),
  paymentMethodKey: str(40).min(1),
  customerNote: str(500).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Please accept the terms to place your order' }) }),
  marketingConsent: z.boolean().optional().default(false),
});

export const trackSchema = z.object({ orderNumber: str(40).min(3), token: z.string().min(20).max(200) });
export const evidenceBodySchema = z.object({ transactionRef: str(120).optional(), payerNote: str(300).optional() });

const imageRef = z.object({ url: z.string().min(1).max(500), publicId: z.string().max(300).optional(), alt: str(200).optional().default(''), isPrimary: z.boolean().optional().default(false) });
const seo = z.object({ title: str(120).optional(), description: str(300).optional(), ogImage: str(500).optional() }).optional();

export const categoryInput = z.object({
  name: str(120).min(1), slug: str(120).optional(), parent: objectId.nullable().optional(), description: str(2000).optional(),
  image: imageRef.nullable().optional(), banner: imageRef.nullable().optional(), seo, isActive: z.boolean().optional(), showOnHome: z.boolean().optional(), sortOrder: z.number().int().optional(),
});

const variantInput = z.object({
  _id: objectId.optional(), sku: str(60).min(1), name: str(120).min(1), options: z.record(str(80)).optional(),
  price: z.number().min(0).nullable().optional(), salePrice: z.number().min(0).nullable().optional(), inrPrice: z.number().min(0).nullable().optional(),
  stock: z.number().int().min(0).optional(), lowStockThreshold: z.number().int().min(0).nullable().optional(), active: z.boolean().optional(), imageId: str(40).optional(),
});
export const productInput = z.object({
  name: str(200).min(1), slug: str(200).optional(), sku: str(60).min(1), shortDescription: str(400).optional(), description: str(10000).optional(),
  category: objectId.nullable().optional(), subcategory: objectId.nullable().optional(), collections: z.array(str(60)).max(20).optional(), tags: z.array(str(40)).max(30).optional(),
  images: z.array(imageRef).max(12).optional(),
  price: z.number().min(0), salePrice: z.number().min(0).nullable().optional(), saleStart: z.coerce.date().nullable().optional(), saleEnd: z.coerce.date().nullable().optional(),
  inrPrice: z.number().min(0).nullable().optional(), inrSalePrice: z.number().min(0).nullable().optional(),
  stock: z.number().int().min(0).optional(), lowStockThreshold: z.number().int().min(0).optional(),
  variants: z.array(variantInput).max(50).optional(),
  dimensions: str(300).optional(), materials: str(300).optional(), careInstructions: str(1000).optional(),
  specifications: z.array(z.object({ label: str(80), value: str(300) })).max(30).optional(),
  deliveryRestrictions: z.array(str(80)).max(50).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(), isFeatured: z.boolean().optional(), isNewArrival: z.boolean().optional(), seo,
});

export const couponInput = z.object({
  code: str(40).min(3).transform((s) => s.toUpperCase()), description: str(200).optional(), type: z.enum(['percentage', 'fixed', 'free_shipping']), value: z.number().min(0).default(0),
  currency: z.enum(['NPR', 'INR']).optional(), minOrder: z.number().min(0).nullable().optional(), maxDiscount: z.number().min(0).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(), endsAt: z.coerce.date().nullable().optional(), usageLimit: z.number().int().min(1).nullable().optional(), perCustomerLimit: z.number().int().min(1).nullable().optional(),
  firstOrderOnly: z.boolean().optional(), productIds: z.array(objectId).optional(), categoryIds: z.array(objectId).optional(), active: z.boolean().optional(),
}).refine((c) => c.type !== 'percentage' || c.value <= 100, { message: 'Percentage cannot exceed 100', path: ['value'] });

export const zoneInput = z.object({
  name: str(100).min(1), key: str(60).optional(), country: z.string().length(2).toUpperCase(), cities: z.array(str(80)).optional().default([]), districts: z.array(str(80)).optional().default([]),
  currency: z.enum(['NPR', 'INR']).default('NPR'), freeShippingAll: z.boolean().optional(), active: z.boolean().optional(), sortOrder: z.number().int().optional(),
  methods: z.array(z.object({ _id: objectId.optional(), name: str(80).min(1), charge: z.number().min(0), freeThreshold: z.number().min(0).nullable().optional(), estimatedDays: str(60).optional(), codAllowed: z.boolean().optional() })).max(10),
});

export const paymentMethodInput = z.object({
  key: str(40).regex(/^[a-z0-9_-]+$/), label: str(80).min(1), type: z.enum(['qr', 'cod']), countries: z.array(z.string().length(2).toUpperCase()).min(1), currency: z.enum(['NPR', 'INR']),
  qrImageUrl: str(500).optional(), qrPublicId: str(300).optional(), instructions: str(2000).optional(), merchantInfo: str(500).optional(),
  minOrder: z.number().min(0).nullable().optional(), maxOrder: z.number().min(0).nullable().optional(), active: z.boolean(), sortOrder: z.number().int().optional(),
});
