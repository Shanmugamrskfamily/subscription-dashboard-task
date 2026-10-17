// npm run seed            → adds plans and demo data if they are missing
// npm run seed -- --fresh → rebuilds the demo data from scratch
import '../config/bootstrap';
import { getConfig } from '../config/env';
import { connectDatabase } from '../config/db';
import { runSubscriptionLifecycle } from '../jobs/subscription-lifecycle';
import { ADMIN_PASSWORD, DEMO_ACCOUNTS, DEMO_PASSWORD, ensureSeedData } from './seed';

const fresh = process.argv.includes('--fresh');
const close = await connectDatabase(getConfig());
try {
  const result = await ensureSeedData({ fresh });
  await runSubscriptionLifecycle();
  console.log(
    result.seeded ? '\nDemo data ready.' : '\nDemo data already present (use --fresh to rebuild).',
  );
  console.log(`  Admin:     ${DEMO_ACCOUNTS.admin} / ${ADMIN_PASSWORD}`);
  console.log(`  Customers: ${DEMO_ACCOUNTS.active} (and others) / ${DEMO_PASSWORD}\n`);
} finally {
  await close();
}
