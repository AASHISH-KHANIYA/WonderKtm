import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import ShopLayout from '@/layouts/ShopLayout';
import AdminLayout from '@/layouts/AdminLayout';
import Home from '@/pages/Home';
import Shop from '@/pages/Shop';
import Product from '@/pages/Product';
import Cart from '@/pages/Cart';
import Checkout from '@/pages/Checkout';
import { AccountOrder, GuestOrder, TrackForm } from '@/pages/OrderPages';
import { Forgot, Login, Register, Reset, VerifyEmail } from '@/pages/Auth';
import { AccountLayout, Addresses, Orders, Profile, Wishlist } from '@/pages/Account';
import { About, Contact, Faq, NotFound, Policy, ShippingInfo } from '@/pages/Static';
import { PageLoader } from '@/components/ui';

// The admin bundle is only downloaded by staff.
const Dashboard = lazy(() => import('@/pages/admin/Dashboard'));
const Payments = lazy(() => import('@/pages/admin/Payments'));

const lz = (imp: () => Promise<any>, key: string) => lazy(() => imp().then((m) => ({ default: m[key] })));
const OrdersList = lz(() => import('@/pages/admin/Orders'), 'OrdersList'); const OrderDetail = lz(() => import('@/pages/admin/Orders'), 'OrderDetail');
const CustomersList = lz(() => import('@/pages/admin/Customers'), 'CustomersList'); const CustomerDetail = lz(() => import('@/pages/admin/Customers'), 'CustomerDetail');
const ProductsList = lz(() => import('@/pages/admin/Products'), 'ProductsList'); const ProductEditor = lz(() => import('@/pages/admin/Products'), 'ProductEditor');
const CategoriesAdmin = lz(() => import('@/pages/admin/Catalog'), 'CategoriesAdmin'); const InventoryAdmin = lz(() => import('@/pages/admin/Catalog'), 'InventoryAdmin');
const CouponsAdmin = lz(() => import('@/pages/admin/Marketing'), 'CouponsAdmin'); const ShippingAdmin = lz(() => import('@/pages/admin/Marketing'), 'ShippingAdmin');
const ContentAdmin = lz(() => import('@/pages/admin/Content'), 'ContentAdmin'); const PoliciesAdmin = lz(() => import('@/pages/admin/Content'), 'PoliciesAdmin'); const FaqsAdmin = lz(() => import('@/pages/admin/Content'), 'FaqsAdmin');
const SettingsAdmin = lz(() => import('@/pages/admin/Settings'), 'SettingsAdmin'); const StaffAdmin = lz(() => import('@/pages/admin/Settings'), 'StaffAdmin'); const AuditAdmin = lz(() => import('@/pages/admin/Settings'), 'AuditAdmin');

const S = ({ children }: { children: React.ReactNode }) => <Suspense fallback={<PageLoader />}>{children}</Suspense>;

export default function App() {
  return (
    <Routes>
      <Route element={<ShopLayout />}>
        <Route index element={<Home />} />
        <Route path="shop" element={<Shop />} />
        <Route path="category/:slug" element={<Shop />} />
        <Route path="product/:slug" element={<Product />} />
        <Route path="cart" element={<Cart />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="order/:orderNumber" element={<GuestOrder />} />
        <Route path="track" element={<TrackForm />} />
        <Route path="login" element={<Login />} /><Route path="register" element={<Register />} /><Route path="forgot-password" element={<Forgot />} /><Route path="reset-password" element={<Reset />} /><Route path="verify-email" element={<VerifyEmail />} />
        <Route path="wishlist" element={<Wishlist />} />
        <Route path="account" element={<AccountLayout />}><Route index element={<Profile />} /><Route path="orders" element={<Orders />} /><Route path="orders/:id" element={<AccountOrder />} /><Route path="addresses" element={<Addresses />} /></Route>
        <Route path="about" element={<About />} /><Route path="contact" element={<Contact />} /><Route path="faq" element={<Faq />} /><Route path="shipping-info" element={<ShippingInfo />} /><Route path="policies/:slug" element={<Policy />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<S><Dashboard /></S>} />
        <Route path="payments" element={<S><Payments /></S>} />
        <Route path="orders" element={<S><OrdersList /></S>} /><Route path="orders/:id" element={<S><OrderDetail /></S>} />
        <Route path="customers" element={<S><CustomersList /></S>} /><Route path="customers/:id" element={<S><CustomerDetail /></S>} />
        <Route path="products" element={<S><ProductsList /></S>} /><Route path="products/:id" element={<S><ProductEditor /></S>} />
        <Route path="categories" element={<S><CategoriesAdmin /></S>} /><Route path="inventory" element={<S><InventoryAdmin /></S>} />
        <Route path="coupons" element={<S><CouponsAdmin /></S>} /><Route path="shipping" element={<S><ShippingAdmin /></S>} />
        <Route path="content" element={<S><ContentAdmin /></S>} /><Route path="policies" element={<S><PoliciesAdmin /></S>} /><Route path="faqs" element={<S><FaqsAdmin /></S>} />
        <Route path="settings" element={<S><SettingsAdmin /></S>} /><Route path="staff" element={<S><StaffAdmin /></S>} /><Route path="audit" element={<S><AuditAdmin /></S>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
