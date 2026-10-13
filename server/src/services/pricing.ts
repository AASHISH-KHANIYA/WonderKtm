import { round2 } from '../utils/helpers.js';

export type Currency = 'NPR' | 'INR';

export interface PriceableVariant {
  _id?: unknown;
  price?: number | null;
  salePrice?: number | null;
  inrPrice?: number | null;
}
export interface PriceableProduct {
  price: number;
  salePrice?: number | null;
  saleStart?: Date | null;
  saleEnd?: Date | null;
  inrPrice?: number | null;
  inrSalePrice?: number | null;
}

export function saleActive(p: Pick<PriceableProduct, 'saleStart' | 'saleEnd'>, now = new Date()) {
  if (p.saleStart && now < new Date(p.saleStart)) return false;
  if (p.saleEnd && now > new Date(p.saleEnd)) return false;
  return true;
}

/**
 * Resolves the price a customer pays per unit, server-side only.
 * Returns null when the product cannot be sold in the currency (e.g. no INR price configured).
 */
export function unitPrice(product: PriceableProduct, variant: PriceableVariant | undefined, currency: Currency, now = new Date()) {
  let list: number | null | undefined;
  let sale: number | null | undefined;
  if (currency === 'NPR') {
    list = variant?.price ?? product.price;
    sale = variant?.salePrice ?? product.salePrice;
  } else {
    list = variant?.inrPrice ?? product.inrPrice;
    sale = product.inrSalePrice;
  }
  if (list == null || !(list >= 0)) return null;
  const onSale = sale != null && sale >= 0 && sale < list && saleActive(product, now);
  return { list: round2(list), unit: round2(onSale ? (sale as number) : list), onSale };
}

export interface TotalsInput {
  lines: { unit: number; quantity: number }[];
  discount: number;
  shipping: number;
  taxRatePercent?: number;
  taxEnabled?: boolean;
  pricesIncludeTax?: boolean;
}

export function computeTotals(i: TotalsInput) {
  const subtotal = round2(i.lines.reduce((s, l) => s + round2(l.unit * l.quantity), 0));
  const discount = round2(Math.min(Math.max(i.discount, 0), subtotal));
  const taxable = round2(subtotal - discount);
  let tax = 0;
  let addedTax = 0;
  if (i.taxEnabled && i.taxRatePercent && i.taxRatePercent > 0) {
    if (i.pricesIncludeTax) tax = round2(taxable - taxable / (1 + i.taxRatePercent / 100));
    else {
      tax = round2((taxable * i.taxRatePercent) / 100);
      addedTax = tax;
    }
  }
  const shipping = round2(Math.max(i.shipping, 0));
  const total = round2(taxable + shipping + addedTax);
  return { subtotal, discount, shipping, tax, total };
}
