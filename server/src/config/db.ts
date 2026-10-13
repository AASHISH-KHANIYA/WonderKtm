import mongoose from 'mongoose';
import { env } from './env.js';

export const dbState = { supportsTransactions: false };

export async function connectDb(uri = env.MONGODB_URI) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
    // Transactions need a replica set (Atlas always is) or a sharded cluster.
    dbState.supportsTransactions = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  } catch {
    dbState.supportsTransactions = false;
  }
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

/**
 * Runs fn inside a transaction when the deployment supports it, otherwise without a session.
 * Callers still use atomic conditional updates plus compensating actions, so correctness
 * never depends on transactions alone.
 */
export async function withOptionalTransaction<T>(fn: (session: mongoose.ClientSession | undefined) => Promise<T>): Promise<T> {
  if (!dbState.supportsTransactions) return fn(undefined);
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
