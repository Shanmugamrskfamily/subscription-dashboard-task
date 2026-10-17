import { describe, expect, it } from 'vitest';
import { demoSeededAt, refreshDemoIfStale, shouldRefreshDemo } from '../src/jobs/demo-refresh';
import { UserModel } from '../src/modules/users/user.model';
import { DEMO_ACCOUNTS, ensureSeedData } from '../src/seed/seed';

const HOUR = 60 * 60_000;
// 21:00 UTC is 02:30 in India, inside the quiet window.
const quiet = new Date('2026-10-18T21:00:00Z');
const daytime = new Date('2026-10-18T06:00:00Z');

describe('demo data refresh', () => {
  it('waits until the data is a day old and the quiet hours', () => {
    expect(shouldRefreshDemo(new Date(quiet.getTime() - 2 * HOUR), quiet)).toBe(false);
    expect(shouldRefreshDemo(new Date(daytime.getTime() - 30 * HOUR), daytime)).toBe(false);
    expect(shouldRefreshDemo(new Date(quiet.getTime() - 21 * HOUR), quiet)).toBe(true);
  });

  it('rebuilds stale demo data and leaves fresh data alone', async () => {
    await ensureSeedData();
    const first = await demoSeededAt();
    expect(first).not.toBeNull();
    const before = await UserModel.findOne({ email: DEMO_ACCOUNTS.admin }).select('_id').lean();

    expect(await refreshDemoIfStale(new Date(first!.getTime() + HOUR))).toBe(false);

    const later = new Date(Date.UTC(2099, 0, 1, 21, 0));
    expect(await refreshDemoIfStale(later)).toBe(true);
    const after = await UserModel.findOne({ email: DEMO_ACCOUNTS.admin }).select('_id').lean();
    // A rebuilt demo has new records, and still exactly one demo admin.
    expect(after?._id.equals(before!._id)).toBe(false);
    expect(await UserModel.countDocuments({ email: DEMO_ACCOUNTS.admin })).toBe(1);
  });
});
