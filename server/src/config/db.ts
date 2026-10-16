import dns from 'node:dns';
import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import type { AppConfig } from './env';

/**
 * Connects to MongoDB and returns a function that closes the connection.
 * Without MONGODB_URI (local development only) it starts an in-memory replica set,
 * which also supports the transactions the subscription flow relies on.
 */
export async function connectDatabase(config: AppConfig): Promise<() => Promise<void>> {
  mongoose.set('strictQuery', true);
  if (config.dnsServers.length) dns.setServers(config.dnsServers);

  let uri = config.mongoUri;
  let stopMemoryServer: (() => Promise<unknown>) | undefined;

  if (!uri) {
    if (config.isProd) throw new Error('MONGODB_URI is required in production');
    const { MongoMemoryReplSet } = await import('mongodb-memory-server-core');
    const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    uri = replSet.getUri('planpilot');
    stopMemoryServer = () => replSet.stop();
    logger.warn('MONGODB_URI is not set: using an in-memory database that resets on restart');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');

  return async () => {
    await mongoose.disconnect();
    await stopMemoryServer?.();
  };
}
