import { Schema, model } from 'mongoose';

const seoSchema = new Schema({ title: String, description: String, ogImage: String }, { _id: false });
const imageSchema = new Schema(
  { url: { type: String, required: true }, publicId: String, alt: { type: String, default: '' }, isPrimary: { type: Boolean, default: false } },
  { _id: true }
);

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, index: true },
    slugHistory: { type: [String], default: [] },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    description: { type: String, default: '', maxlength: 2000 },
    image: imageSchema,
    banner: imageSchema,
    seo: seoSchema,
    isActive: { type: Boolean, default: true, index: true },
    showOnHome: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    archivedAt: Date,
  },
  { timestamps: true }
);
export const Category = model('Category', categorySchema);

const variantSchema = new Schema(
  {
    sku: { type: String, required: true, trim: true },
    name: { type: String, required: true, maxlength: 120 },
    options: { type: Map, of: String, default: {} },
    price: Number, // NPR override
    salePrice: Number,
    inrPrice: Number,
    stock: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    lowStockThreshold: Number,
    active: { type: Boolean, default: true },
    imageId: String,
  },
  { _id: true }
);

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, index: true },
    slugHistory: { type: [String], default: [], index: true },
    sku: { type: String, required: true, unique: true, trim: true },
    shortDescription: { type: String, default: '', maxlength: 400 },
    description: { type: String, default: '', maxlength: 10000 },
    category: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
    subcategory: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
    collections: { type: [String], default: [], index: true },
    tags: { type: [String], default: [] },
    images: { type: [imageSchema], default: [], validate: (v: unknown[]) => v.length <= 12 },
    price: { type: Number, required: true, min: 0 }, // NPR
    salePrice: { type: Number, min: 0 },
    saleStart: Date,
    saleEnd: Date,
    inrPrice: { type: Number, min: 0 }, // optional INR price; INR orders only allowed when set
    inrSalePrice: { type: Number, min: 0 },
    stock: { type: Number, default: 0, min: 0 }, // used when the product has no variants
    reserved: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    variants: { type: [variantSchema], default: [], validate: (v: unknown[]) => v.length <= 50 },
    dimensions: { type: String, default: '' },
    materials: { type: String, default: '' },
    careInstructions: { type: String, default: '' },
    specifications: { type: [{ label: String, value: String }], default: [] },
    deliveryRestrictions: { type: [String], default: [] }, // city / zone keys that cannot receive this product
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    isNewArrival: { type: Boolean, default: false, index: true },
    soldCount: { type: Number, default: 0, index: true },
    seo: seoSchema,
    publishedAt: Date,
  },
  { timestamps: true }
);
productSchema.index({ status: 1, category: 1, price: 1 });
productSchema.index({ 'variants.sku': 1 }, { unique: true, sparse: true });
export const Product = model('Product', productSchema);
