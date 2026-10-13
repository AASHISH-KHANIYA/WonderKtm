import { createApp } from './app.js';
import { connectDb, dbState } from './config/db.js';
import { env } from './config/env.js';
import { expireStaleOrders } from './services/orders.js';
import { storageStatus } from './services/storage.js';

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`Wonderktm API listening on :${env.PORT} (${env.NODE_ENV})`);
    console.log(`Transactions: ${dbState.supportsTransactions ? 'enabled' : 'unavailable (using atomic updates + compensation)'}`);
    console.log(`Storage: ${storageStatus().note}`);
  });
  setInterval(() => expireStaleOrders().catch((e) => console.error('expire job failed', e)), 30 * 60_000).unref();
}
main().catch((e) => { console.error('Failed to start:', e.message); process.exit(1); });
