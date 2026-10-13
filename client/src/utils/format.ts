import type { Currency } from '@/types';
export const money = (n: number | null | undefined, c: Currency = 'NPR') => `${c} ${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const dateTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu' }) : '—');
export const date = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Kathmandu' }) : '—');
export const label = (s?: string) => (s ?? '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export const COUNTRY_NAMES: Record<string, string> = { NP: 'Nepal', IN: 'India', US: 'United States', GB: 'United Kingdom', AU: 'Australia', CA: 'Canada', AE: 'United Arab Emirates' };
export const countryName = (c: string) => COUNTRY_NAMES[c] ?? c;
export const currencyForCountry = (c: string) => (c === 'IN' ? 'INR' : 'NPR') as Currency;
export const img = (u?: string) => u || '/placeholder.svg';
