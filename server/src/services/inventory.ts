import type { ClientSession } from 'mongoose';
import { InventoryMovement, Product } from '../models/index.js';
import { AppError } from '../utils/errors.js';

export interface StockLine { productId: unknown; variantId?: unknown; quantity: number; sku?: string }

/** Atomically moves `qty` from available stock to reserved. Fails (returns false) rather than going below zero. */
async function reserveOne(l: StockLine, session?: ClientSession) {
  if (l.variantId) {
    const r = await Product.updateOne(
      { _id: l.productId, status: 'published', variants: { $elemMatch: { _id: l.variantId, active: true, stock: { $gte: l.quantity } } } },
      { $inc: { 'variants.$.stock': -l.quantity, 'variants.$.reserved': l.quantity } },
      { session }
    );
    return r.modifiedCount === 1;
  }
  const r = await Product.updateOne({ _id: l.productId, status: 'published', stock: { $gte: l.quantity } }, { $inc: { stock: -l.quantity, reserved: l.quantity } }, { session });
  return r.modifiedCount === 1;
}

async function move(l: StockLine, mode: 'release' | 'restock' | 'commit', session?: ClientSession) {
  const q = l.quantity;
  const inc =
    mode === 'release' ? { stock: q, reserved: -q } : mode === 'restock' ? { stock: q } : { reserved: -q };
  if (l.variantId) {
    const set: Record<string, number> = {};
    for (const [k, v] of Object.entries(inc)) set[`variants.$[v].${k}`] = v;
    await Product.updateOne({ _id: l.productId }, { $inc: set }, { arrayFilters: [{ 'v._id': l.variantId }], session });
  } else {
    await Product.updateOne({ _id: l.productId }, { $inc: inc }, { session });
  }
}

async function balance(l: StockLine) {
  const p = await Product.findById(l.productId).select('stock variants').lean();
  if (!p) return undefined;
  if (l.variantId) return (p.variants as any[]).find((v) => String(v._id) === String(l.variantId))?.stock;
  return p.stock;
}

export async function reserveStock(lines: StockLine[], orderId: unknown, session?: ClientSession) {
  const done: StockLine[] = [];
  for (const l of lines) {
    const ok = await reserveOne(l, session);
    if (!ok) {
      // compensate: undo what we already reserved so nothing leaks
      for (const d of done) await move(d, 'release', session);
      throw new AppError(409, 'Sorry, one of the items just sold out or has less stock than requested.', 'OUT_OF_STOCK', { productId: String(l.productId), variantId: l.variantId ? String(l.variantId) : undefined });
    }
    done.push(l);
  }
  await InventoryMovement.insertMany(
    await Promise.all(lines.map(async (l) => ({ product: l.productId, variantId: l.variantId, sku: l.sku, delta: -l.quantity, reason: 'order_reserved', order: orderId, balanceAfter: await balance(l) }))),
    { session }
  );
}

/** state: where the units currently are. reserved => back to stock from reservation; committed => plain restock. */
export async function releaseStock(lines: StockLine[], state: 'reserved' | 'committed', orderId: unknown, by?: unknown) {
  for (const l of lines) await move(l, state === 'reserved' ? 'release' : 'restock');
  await InventoryMovement.insertMany(
    await Promise.all(lines.map(async (l) => ({ product: l.productId, variantId: l.variantId, sku: l.sku, delta: l.quantity, reason: state === 'reserved' ? 'order_released' : 'return', order: orderId, by, balanceAfter: await balance(l) })))
  );
}

export async function commitStock(lines: StockLine[]) {
  for (const l of lines) {
    await move(l, 'commit');
    await Product.updateOne({ _id: l.productId }, { $inc: { soldCount: l.quantity } });
  }
}

export async function adjustStock(opts: { productId: string; variantId?: string; delta?: number; setTo?: number; reason: 'restock' | 'adjustment' | 'initial'; note?: string; by?: unknown }) {
  const p = await Product.findById(opts.productId).select('stock variants sku');
  if (!p) throw new AppError(404, 'Product not found.');
  const v = opts.variantId ? p.variants.id(opts.variantId) : undefined;
  if (opts.variantId && !v) throw new AppError(404, 'Variant not found.');
  const current = v ? v.stock : p.stock;
  const delta = opts.setTo != null ? opts.setTo - current : opts.delta ?? 0;
  if (current + delta < 0) throw new AppError(400, 'Stock cannot go below zero.');
  const filter = v ? { _id: p._id, variants: { $elemMatch: { _id: v._id, stock: { $gte: -delta } } } } : { _id: p._id, stock: { $gte: -delta } };
  const inc = v ? { 'variants.$.stock': delta } : { stock: delta };
  const r = await Product.updateOne(filter, { $inc: inc });
  if (r.modifiedCount !== 1) throw new AppError(409, 'Stock changed while you were editing. Please reload and try again.', 'STOCK_CONFLICT');
  const after = current + delta;
  await InventoryMovement.create({ product: p._id, variantId: v?._id, sku: v?.sku ?? p.sku, delta, reason: opts.reason, by: opts.by, note: opts.note, balanceAfter: after });
  return after;
}
