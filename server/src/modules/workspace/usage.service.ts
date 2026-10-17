import { ERROR_CODES } from '@planpilot/shared';
import type { LimitKey } from '@planpilot/shared';
import { ApiError } from '../../utils/api-error';
import { notify } from '../notifications/notification.service';
import { planLimits } from '../plans/plan.serializer';
import { getCurrentPlan } from '../subscriptions/subscription.service';
import { UserModel } from '../users/user.model';

const LABELS: Record<LimitKey, string> = { projects: 'Projects', teamMembers: 'Team members' };

/** Without an active plan the workspace is read-only: items can be viewed and deleted, not added or changed. */
export async function requireActivePlan(userId: string) {
  const current = await getCurrentPlan(userId);
  if (!current) {
    throw ApiError.forbidden(
      'Your workspace is read-only. Renew a plan to make changes.',
      ERROR_CODES.READ_ONLY,
    );
  }
  return current;
}

/**
 * Reserves one unit of a plan limit with a single conditional update:
 * "add 1 to usage.projects only if it is below the limit". MongoDB applies that
 * atomically, so two creates racing for the last slot can't both get it.
 * (Counting first and inserting afterwards would let both through.)
 */
export async function reserveUsage(userId: string, key: LimitKey): Promise<void> {
  const current = await requireActivePlan(userId);
  const limit = planLimits(current.plan)[key];
  const field = `usage.${key}`;
  const filter = limit === null ? { _id: userId } : { _id: userId, [field]: { $lt: limit } };

  const result = await UserModel.updateOne(filter, { $inc: { [field]: 1 } });
  if (result.modifiedCount === 1) return;

  const user = await UserModel.findById(userId).select('usage').lean();
  const used = user?.usage?.[key] ?? 0;
  await notify(userId, 'limit_reached', {
    label: LABELS[key],
    limit: limit ?? 0,
    plan: current.plan.name,
  });
  throw ApiError.forbidden(
    `You've reached the ${current.plan.name} limit of ${limit} ${LABELS[key].toLowerCase()}.`,
    ERROR_CODES.PLAN_LIMIT_REACHED,
    { key, limit, used, plan: current.plan.name },
  );
}

export async function releaseUsage(userId: string, key: LimitKey): Promise<void> {
  const field = `usage.${key}`;
  await UserModel.updateOne({ _id: userId, [field]: { $gt: 0 } }, { $inc: { [field]: -1 } });
}
