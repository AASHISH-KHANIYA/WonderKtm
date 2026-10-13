import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { CartItem, Currency, Quote } from '@/types';

const KEY = 'wk_cart_v1';
interface CartState {
  items: CartItem[]; count: number; coupon: string; setCoupon: (c: string) => void;
  add: (i: CartItem) => void; setQty: (productId: string, variantId: string | undefined, q: number) => void; remove: (productId: string, variantId?: string) => void; clear: () => void;
}
const Ctx = createContext<CartState>(null as never);
export const useCart = () => useContext(Ctx);
const same = (a: CartItem, productId: string, variantId?: string) => a.productId === productId && (a.variantId ?? '') === (variantId ?? '');

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}').items ?? []; } catch { return []; } });
  const [coupon, setCoupon] = useState<string>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}').coupon ?? ''; } catch { return ''; } });
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ items, coupon })); } catch { /* storage may be unavailable (private mode) */ } }, [items, coupon]);
  const add = useCallback((i: CartItem) => setItems((x) => { const e = x.find((a) => same(a, i.productId, i.variantId)); return e ? x.map((a) => (a === e ? { ...a, quantity: Math.min(20, a.quantity + i.quantity) } : a)) : [...x, i]; }), []);
  const setQty = useCallback((p: string, v: string | undefined, q: number) => setItems((x) => x.map((a) => (same(a, p, v) ? { ...a, quantity: Math.max(1, Math.min(20, q)) } : a))), []);
  const remove = useCallback((p: string, v?: string) => setItems((x) => x.filter((a) => !same(a, p, v))), []);
  const clear = useCallback(() => { setItems([]); setCoupon(''); }, []);
  const value = useMemo(() => ({ items, count: items.reduce((s, i) => s + i.quantity, 0), coupon, setCoupon, add, setQty, remove, clear }), [items, coupon, add, setQty, remove, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The server is the only source of prices, shipping, discounts and totals. The browser never calculates them. */
export function useQuote(opts: { currency: Currency; country?: string; city?: string; district?: string; email?: string; paymentMethodKey?: string }) {
  const { items, coupon } = useCart();
  return useQuery({
    queryKey: ['quote', items.map((i) => [i.productId, i.variantId, i.quantity]), coupon, opts],
    queryFn: () => api.post<Quote>('/cart/quote', { items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })), couponCode: coupon || undefined, ...opts }),
    enabled: items.length > 0, retry: false, placeholderData: (p) => p,
  });
}
