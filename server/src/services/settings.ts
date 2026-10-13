import { StoreSettings } from '../models/index.js';

let cache: { at: number; value: any } | null = null;

export async function getSettings(fresh = false) {
  if (!fresh && cache && Date.now() - cache.at < 15_000) return cache.value;
  const doc = await StoreSettings.findOneAndUpdate({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  cache = { at: Date.now(), value: doc };
  return doc as any;
}
export const invalidateSettings = () => {
  cache = null;
};
