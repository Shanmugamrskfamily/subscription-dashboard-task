import { UserModel } from '../modules/users/user.model';
import { DEMO_ACCOUNTS, ensureSeedData } from '../seed/seed';
import { logger } from '../utils/logger';

const HOUR_MS = 60 * 60_000;
const MAX_AGE_MS = 20 * HOUR_MS;
// 02:00–05:00 in India (UTC+5:30) is 20:30–23:30 UTC: nobody is mid-review.
const QUIET_START_UTC_MIN = 20 * 60 + 30;
const QUIET_END_UTC_MIN = 23 * 60 + 30;

/**
 * The demo story is relative to when it was seeded ("Kavya's plan ends in 2 days").
 * Rebuild it once it is a day old, but only in the quiet hours.
 */
export function shouldRefreshDemo(seededAt: Date, now: Date): boolean {
  if (now.getTime() - seededAt.getTime() < MAX_AGE_MS) return false;
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return minutes >= QUIET_START_UTC_MIN && minutes < QUIET_END_UTC_MIN;
}

/** When the demo data was built: the admin's id is created at seed time (its dates are backdated). */
export async function demoSeededAt(): Promise<Date | null> {
  const admin = await UserModel.findOne({ email: DEMO_ACCOUNTS.admin }).select('_id').lean();
  return admin ? admin._id.getTimestamp() : null;
}

export async function refreshDemoIfStale(now = new Date()): Promise<boolean> {
  const seededAt = await demoSeededAt();
  if (!seededAt || !shouldRefreshDemo(seededAt, now)) return false;
  await ensureSeedData({ fresh: true, now });
  logger.info({ seededAt }, 'Demo data refreshed');
  return true;
}

export function startDemoRefresh(intervalMs = 15 * 60_000): () => void {
  const timer = setInterval(() => {
    refreshDemoIfStale().catch((error: unknown) =>
      logger.error({ err: error }, 'Demo data refresh failed'),
    );
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
