import { generateServerKeyPair } from '@planpilot/shared/crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

// Fresh payload keys for every run, set before any app module reads config.
const keys = await generateServerKeyPair();
process.env.PAYLOAD_PRIVATE_KEY = keys.privateKey;
process.env.PAYLOAD_PUBLIC_KEY = keys.publicKey;
process.env.PAYLOAD_KID = 'k1';

let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  // A replica set (not a single node) so the subscription transactions really run.
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri('planpilot-test'));
  // Build every index, including the "one active plan per user" partial unique index.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});
