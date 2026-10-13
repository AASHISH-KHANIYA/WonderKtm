import { connectDb, disconnectDb } from '../config/db.js';
import { Category, FAQ, PolicyVersion, Product, ShippingZone, StoreSettings, WebsiteContent, Counter } from '../models/index.js';
import { slugify } from '../utils/helpers.js';
import { FAQS, POLICIES } from './policyTemplates.js';

const demo = process.argv.includes('--demo');

const CATEGORIES = ['Wall Décor', 'Paintings / Wall Art', 'Lamps / Lighting', 'Showpieces / Figurines', 'Clocks', 'Gift Items'];

const homepage = {
  hero: { headline: 'Discover Delight Repeat.', subheadline: 'Home décor and gifts, carefully chosen and delivered from Kathmandu.', ctaLabel: 'Shop now', ctaLink: '/shop', secondaryLabel: 'Browse categories', secondaryLink: '/shop', image: '' },
  sections: [
    { type: 'categories', enabled: true, title: 'Shop by category' },
    { type: 'newArrivals', enabled: true, title: 'New arrivals' },
    { type: 'offers', enabled: true, title: 'Special offers' },
    { type: 'bestSellers', enabled: true, title: 'Best sellers' },
    { type: 'featured', enabled: true, title: 'Featured' },
    { type: 'about', enabled: true, title: 'About Wonderktm' },
    { type: 'trust', enabled: true, title: 'Why shop with us' },
    { type: 'social', enabled: false, title: 'Follow us' },
  ],
  trust: [{ title: 'Free delivery in Kathmandu', text: 'Estimated delivery in about 2–3 days.' }, { title: 'Verified payments', text: 'Every QR payment is checked by our team before your order is confirmed.' }, { title: 'Open 24/7 online', text: 'Order any time, we process during working hours.' }],
};

async function main() {
  await connectDb();
  await StoreSettings.updateOne({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true });
  // Payment methods are seeded INACTIVE and without QR images: the owner must upload the real official QR codes.
  const s: any = await StoreSettings.findOne({ key: 'main' });
  if (!s.paymentMethods.length) {
    s.paymentMethods = [
      { key: 'esewa', label: 'eSewa QR', type: 'qr', countries: ['NP'], currency: 'NPR', instructions: 'Scan the QR with the eSewa app, pay the exact amount, then upload your screenshot and transaction ID.', active: false, sortOrder: 0 },
      { key: 'khalti', label: 'Khalti QR', type: 'qr', countries: ['NP'], currency: 'NPR', instructions: 'Scan the QR with the Khalti app, pay the exact amount, then upload your screenshot and transaction ID.', active: false, sortOrder: 1 },
      { key: 'cod', label: 'Cash on delivery', type: 'cod', countries: ['NP'], currency: 'NPR', instructions: 'Pay in cash when your order arrives.', active: false, sortOrder: 2 },
      { key: 'upi', label: 'UPI QR (India)', type: 'qr', countries: ['IN'], currency: 'INR', instructions: 'Scan the UPI QR, pay the exact amount in INR, then upload your screenshot and UTR/reference.', active: false, sortOrder: 3 },
    ];
    await s.save();
  }
  for (const [i, name] of CATEGORIES.entries()) {
    await Category.updateOne({ slug: slugify(name) }, { $setOnInsert: { name, slug: slugify(name), sortOrder: i, isActive: true, showOnHome: true } }, { upsert: true });
  }
  await ShippingZone.updateOne({ key: 'kathmandu' }, { $setOnInsert: { key: 'kathmandu', name: 'Kathmandu', country: 'NP', cities: ['Kathmandu'], currency: 'NPR', freeShippingAll: true, active: true, sortOrder: 0, methods: [{ name: 'Standard delivery', charge: 0, estimatedDays: '2–3 days', codAllowed: true }] } }, { upsert: true });
  // Inactive until the owner enters real rates: we never promise delivery we have not configured.
  await ShippingZone.updateOne({ key: 'rest-of-nepal' }, { $setOnInsert: { key: 'rest-of-nepal', name: 'Rest of Nepal (set rates before enabling)', country: 'NP', cities: [], currency: 'NPR', active: false, sortOrder: 5, methods: [{ name: 'Standard delivery', charge: 0, estimatedDays: 'To be confirmed' }] } }, { upsert: true });

  const now = new Date();
  const blocks: Record<string, unknown> = {
    homepage,
    announcement: { enabled: true, text: 'Free delivery within Kathmandu', link: '/shipping-info' },
    about: { title: 'About Wonderktm', body: 'Wonderktm is a home décor and gifting store based in Kathmandu, Nepal. We select affordable premium pieces — wall décor, art, lamps, showpieces, clocks and gifts — and make them easy to order online.' },
    contact: { address: 'Devkota Marg, Dillibazar, Kathmandu, Bagmati Province, Nepal', email: '', phone: '', hours: 'Online 24/7', mapUrl: '' },
    footer: { links: [{ label: 'About', href: '/about' }, { label: 'Contact', href: '/contact' }, { label: 'FAQ', href: '/faq' }, { label: 'Track order', href: '/track' }], showPolicies: true },
  };
  for (const [key, value] of Object.entries(blocks)) await WebsiteContent.updateOne({ key }, { $setOnInsert: { key, draft: value, published: value, publishedAt: now } }, { upsert: true });

  // Policies are seeded as DRAFTS (not published): the owner must review, then publish.
  for (const p of POLICIES) await PolicyVersion.updateOne({ slug: p.slug, version: 1 }, { $setOnInsert: { ...p, version: 1, status: 'draft', ownerReviewed: false } }, { upsert: true });
  if (!(await FAQ.countDocuments())) await FAQ.insertMany(FAQS.map((f, i) => ({ ...f, sortOrder: i })));
  await Counter.updateOne({ _id: 'order' }, { $setOnInsert: { seq: 0 } }, { upsert: true });

  if (demo) {
    const cats = new Map((await Category.find().lean()).map((c: any) => [c.slug, c._id]));
    const samples = [
      ['Demo Brass Wall Mirror', 'wall-decor', 4200, 'WALL'], ['Demo Abstract Canvas Print', 'paintings-wall-art', 3500, 'ART'], ['Demo Table Lamp', 'lamps-lighting', 2800, 'LAMP'],
      ['Demo Ceramic Figurine', 'showpieces-figurines', 2200, 'FIG'], ['Demo Wall Clock', 'clocks', 3100, 'CLK'], ['Demo Gift Hamper', 'gift-items', 5600, 'GIFT'],
    ] as const;
    for (const [i, [name, cat, price, code]] of samples.entries()) {
      await Product.updateOne({ sku: `DEMO-${code}-001` }, { $setOnInsert: {
        name, slug: slugify(name), sku: `DEMO-${code}-001`, shortDescription: 'DEMO PRODUCT — sample data, not real inventory.', description: 'This is demo data created by the seed script so you can explore the store. Delete it before going live.',
        category: cats.get(cat), price, salePrice: i % 3 === 0 ? Math.round(price * 0.85) : undefined, stock: 20, status: 'published', isFeatured: i < 3, isNewArrival: i % 2 === 0, tags: ['demo'],
        images: [{ url: '/placeholder.svg', alt: `${name} (placeholder image)`, isPrimary: true }],
      } }, { upsert: true });
    }
    console.log('Demo products created (SKUs start with DEMO-). They are not real inventory.');
  }
  console.log('Seed complete. Payment methods are inactive until you upload QR images in Admin → Settings.');
  await disconnectDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
