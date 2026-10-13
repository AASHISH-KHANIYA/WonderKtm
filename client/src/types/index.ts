export type Currency = 'NPR' | 'INR';
export interface Img { id?: string; publicId?: string; url: string; alt?: string; isPrimary?: boolean }
export interface Variant { id: string; name: string; sku: string; options: Record<string, string>; price: number; salePrice: number | null; inrPrice: number | null; stock: number; inStock: boolean }
export interface Product {
  id: string; name: string; slug: string; sku: string; shortDescription: string; description: string;
  category: { id: string; name: string; slug: string } | string | null; subcategory: { id: string; name: string; slug: string } | null;
  images: Img[]; price: number; salePrice: number | null; onSale: boolean; priceFrom: number; priceTo: number; inrPrice: number | null;
  stock: number; inStock: boolean; lowStock: boolean; variants: Variant[]; dimensions: string; materials: string; careInstructions: string;
  specifications: { label: string; value: string }[]; isFeatured: boolean; isNewArrival: boolean; tags: string[]; seo?: { title?: string; description?: string; ogImage?: string };
}
export interface Category { id: string; name: string; slug: string; parent: string | null; description: string; image?: Img; banner?: Img; showOnHome: boolean; productCount: number; seo?: { title?: string; description?: string } }
export interface Paged<T> { items: T[]; total: number; page: number; limit: number; pages: number }
export interface User { id: string; email: string; firstName: string; lastName: string; phone?: string; role: string; emailVerified: boolean; marketingConsent: boolean; addresses: Address[] }
export interface Address { _id?: string; label?: string; recipientName?: string; phone?: string; country: string; region?: string; city: string; district?: string; street: string; building?: string; landmark?: string; postalCode?: string; isDefault?: boolean }
export interface Site {
  business: { name: string; tagline: string; address: string; email: string; phone: string; whatsapp: string; hours: string; logoUrl?: string; social?: Record<string, string> };
  currencies: Currency[]; countries: string[]; maintenanceMode: boolean; maintenanceMessage: string; theme?: Record<string, string>;
  seoDefaults: { title: string; description: string; ogImage?: string }; announcement: { enabled?: boolean; text?: string; link?: string } | null;
  footer: { links?: { label: string; href: string }[] } | null; contact: Record<string, string> | null; tax?: { enabled: boolean; label: string };
}
export interface CartItem { productId: string; variantId?: string; quantity: number; name: string; slug: string; image?: string; variantName?: string }
export interface QuoteLine { productId: string; variantId?: string; name: string; variantLabel?: string; image?: string; unitPrice: number; listPrice: number; quantity: number; lineTotal: number; sku: string }
export interface Quote {
  currency: Currency; lines: QuoteLine[]; totals: { subtotal: number; discount: number; shipping: number; tax: number; total: number };
  coupon: { code: string; discount: number; freeShipping: boolean } | null; couponError?: string;
  shipping: { zoneName: string; methodName: string; charge: number; isFree: boolean; estimatedDays: string; codAllowed: boolean } | null; shippingError?: string;
  paymentMethods: { key: string; label: string; type: 'qr' | 'cod'; currency: Currency }[];
}
