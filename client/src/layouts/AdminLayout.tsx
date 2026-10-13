import { useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, CreditCard, FileText, Gauge, Layers, LogOut, Menu, Package, Percent, Settings, ShieldCheck, ShoppingCart, Tags, Truck, Users, Warehouse, X, ScrollText, HelpCircle, UserCog } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Seo } from '@/components/Seo';
import { PageLoader } from '@/components/ui';
import { Logo } from './ShopLayout';

type Item = { to: string; label: string; icon: any; roles?: string[] };
const NAV: { group: string; items: Item[] }[] = [
  { group: 'Overview', items: [{ to: '/admin', label: 'Dashboard', icon: Gauge }] },
  { group: 'Sales', items: [
    { to: '/admin/payments', label: 'Payment verification', icon: CreditCard, roles: ['order_manager'] }, { to: '/admin/orders', label: 'Orders', icon: ShoppingCart, roles: ['order_manager'] },
    { to: '/admin/customers', label: 'Customers', icon: Users, roles: ['order_manager'] }, { to: '/admin/coupons', label: 'Discounts & coupons', icon: Percent, roles: ['order_manager', 'content_manager'] }, { to: '/admin/shipping', label: 'Shipping', icon: Truck, roles: ['order_manager'] } ] },
  { group: 'Catalogue', items: [{ to: '/admin/products', label: 'Products', icon: Package, roles: ['inventory_manager'] }, { to: '/admin/categories', label: 'Categories', icon: Tags, roles: ['inventory_manager'] }, { to: '/admin/inventory', label: 'Inventory', icon: Warehouse, roles: ['inventory_manager'] }] },
  { group: 'Content', items: [{ to: '/admin/content', label: 'Homepage & pages', icon: Layers, roles: ['content_manager'] }, { to: '/admin/policies', label: 'Policies', icon: FileText, roles: ['content_manager'] }, { to: '/admin/faqs', label: 'FAQs', icon: HelpCircle, roles: ['content_manager'] }] },
  { group: 'Store', items: [{ to: '/admin/settings', label: 'Settings', icon: Settings, roles: [] }, { to: '/admin/staff', label: 'Staff & roles', icon: UserCog, roles: [] }, { to: '/admin/audit', label: 'Audit log', icon: ScrollText, roles: [] }] },
];
export const can = (role: string | undefined, roles?: string[]) => !roles || role === 'owner' || roles.includes(role ?? '');

export default function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (user.role === 'customer') return <Navigate to="/account" replace />;
  const crumbs = loc.pathname.split('/').filter(Boolean);
  const nav = (
    <nav aria-label="Admin" className="space-y-5">
      {NAV.map((g) => { const items = g.items.filter((i) => can(user.role, i.roles)); return items.length > 0 && (
        <div key={g.group}><div className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-white/40">{g.group}</div>
          {items.map((i) => <NavLink key={i.to} end={i.to === '/admin'} to={i.to} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}><i.icon className="h-4 w-4" />{i.label}</NavLink>)}</div>
      ); })}
    </nav>
  );
  return (
    <div className="min-h-screen bg-[#F4F3EF]">
      <Seo title="Admin" noindex />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto bg-navy p-4 lg:block"><Link to="/admin" className="mb-6 block px-3 pt-2"><Logo light /></Link>{nav}</aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-navy/50" onClick={() => setOpen(false)} /><div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-navy p-4"><div className="mb-4 flex justify-between px-3"><Logo light /><button className="text-white" aria-label="Close menu" onClick={() => setOpen(false)}><X /></button></div>{nav}</div></div>}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white px-4 sm:px-6">
          <button className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1 truncate text-xs text-muted">{crumbs.map((c, i) => <span key={i}>{i > 0 && ' / '}<span className={i === crumbs.length - 1 ? 'font-semibold text-navy' : ''}>{c.length > 20 ? '…' : c}</span></span>)}</nav>
          <span className="hidden items-center gap-1 text-xs text-muted sm:flex"><ShieldCheck className="h-4 w-4" />{user.firstName} · {user.role.replace('_', ' ')}</span>
          <Link to="/" className="text-xs font-semibold text-brand hover:underline">View store</Link>
          <button onClick={() => logout()} aria-label="Sign out" className="text-muted hover:text-navy"><LogOut className="h-4 w-4" /></button>
        </header>
        <main className="p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
void BarChart3;
