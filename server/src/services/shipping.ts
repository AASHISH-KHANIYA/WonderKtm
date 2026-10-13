import type { Currency } from './pricing.js';

export interface ZoneLike {
  _id?: unknown;
  name: string;
  country: string;
  cities: string[];
  districts: string[];
  currency: Currency;
  freeShippingAll?: boolean;
  active?: boolean;
  sortOrder?: number;
  methods: { _id?: unknown; name: string; charge: number; freeThreshold?: number | null; estimatedDays?: string | null; codAllowed?: boolean }[];
}

export interface ShippingQuery {
  zones: ZoneLike[];
  country: string;
  city: string;
  district?: string;
  currency: Currency;
  subtotal: number;
  couponFreeShipping?: boolean;
  methodId?: string;
  restrictedKeys?: string[]; // lower-cased cities/zone names where some cart product can't be delivered
}
export type ShippingQuote =
  | { ok: true; zoneName: string; methodId?: string; methodName: string; charge: number; isFree: boolean; estimatedDays: string; codAllowed: boolean }
  | { ok: false; reason: string };

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

export function quoteShipping(q: ShippingQuery): ShippingQuote {
  const city = norm(q.city);
  const district = norm(q.district);
  const candidates = q.zones.filter((z) => z.active !== false && z.country === q.country && z.currency === q.currency);
  if (candidates.length === 0) return { ok: false, reason: 'We do not deliver to this country with the selected currency yet.' };

  // Most specific wins: city match > district match > country-wide zone.
  const rank = (z: ZoneLike) => (z.cities.map(norm).includes(city) ? 0 : district && z.districts.map(norm).includes(district) ? 1 : z.cities.length === 0 && z.districts.length === 0 ? 2 : 99);
  const zone = [...candidates].sort((a, b) => rank(a) - rank(b) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
  if (!zone || rank(zone) === 99) return { ok: false, reason: 'We do not deliver to this location yet.' };

  const restricted = (q.restrictedKeys ?? []).map(norm);
  if (restricted.includes(city) || restricted.includes(norm(zone.name))) return { ok: false, reason: 'One or more items in your cart cannot be delivered to this location.' };

  const method = (q.methodId ? zone.methods.find((m) => String(m._id) === q.methodId) : undefined) ?? zone.methods[0];
  if (!method) return { ok: false, reason: 'No delivery method is available for this location.' };

  const isFree = Boolean(zone.freeShippingAll) || Boolean(q.couponFreeShipping) || (method.freeThreshold != null && method.freeThreshold > 0 && q.subtotal >= method.freeThreshold) || method.charge === 0;
  return {
    ok: true,
    zoneName: zone.name,
    methodId: method._id ? String(method._id) : undefined,
    methodName: method.name,
    charge: isFree ? 0 : method.charge,
    isFree,
    estimatedDays: method.estimatedDays || '',
    codAllowed: Boolean(method.codAllowed),
  };
}
