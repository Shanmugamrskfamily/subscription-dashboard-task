import { DAY_MS, EXPIRING_SOON_DAYS } from '@planpilot/shared';
import { notify } from '../modules/notifications/notification.service';
import { PlanModel } from '../modules/plans/plan.model';
import { SubscriptionModel } from '../modules/subscriptions/subscription.model';
import { expireSubscription } from '../modules/subscriptions/subscription.service';
import { daysLeft } from '../modules/subscriptions/subscription.serializer';
import { logger } from '../utils/logger';

const planNames = async (ids: unknown[]) => {
  const plans = await PlanModel.find({ _id: { $in: ids } })
    .select('name')
    .lean();
  return new Map(plans.map((p) => [p._id.toString(), p.name]));
};

/**
 * Expires plans past their end date and sends the "expires soon" reminders
 * (3 days before and 1 day before), each exactly once. Every update is
 * conditional, so two overlapping runs can't double-notify.
 */
export async function runSubscriptionLifecycle(now = new Date()) {
  const due = await SubscriptionModel.find({ status: 'active', endDate: { $lte: now } })
    .select('userId planId endDate')
    .lean();
  const dueNames = await planNames(due.map((s) => s.planId));
  for (const sub of due)
    await expireSubscription(sub, dueNames.get(sub.planId.toString()) ?? 'Your plan');

  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS);
  const tomorrow = new Date(now.getTime() + DAY_MS);
  const upcoming = await SubscriptionModel.find({
    status: 'active',
    endDate: { $gt: now, $lte: soon },
    $or: [{ remindedExpiringAt: null }, { remindedFinalAt: null, endDate: { $lte: tomorrow } }],
  })
    .select('userId planId endDate remindedExpiringAt remindedFinalAt')
    .lean();
  const upcomingNames = await planNames(upcoming.map((s) => s.planId));

  let reminders = 0;
  for (const sub of upcoming) {
    const final = sub.endDate.getTime() <= tomorrow.getTime();
    const field = final ? 'remindedFinalAt' : 'remindedExpiringAt';
    const claimed = await SubscriptionModel.updateOne(
      { _id: sub._id, [field]: null },
      final
        ? { remindedFinalAt: now, remindedExpiringAt: sub.remindedExpiringAt ?? now }
        : { remindedExpiringAt: now },
    );
    if (!claimed.modifiedCount) continue;
    reminders += 1;
    await notify(sub.userId, 'expiring_soon', {
      plan: upcomingNames.get(sub.planId.toString()) ?? 'Your plan',
      endDate: sub.endDate,
      days: Math.max(1, daysLeft(sub.endDate, now.getTime())),
    });
  }
  return { expired: due.length, reminders };
}

export function startLifecycleJobs(intervalMs = 5 * 60_000): () => void {
  const run = () =>
    runSubscriptionLifecycle()
      .then((result) => {
        if (result.expired || result.reminders) logger.info(result, 'Subscription lifecycle run');
      })
      .catch((error: unknown) => logger.error({ err: error }, 'Subscription lifecycle run failed'));
  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
