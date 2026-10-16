import { ERROR_CODES } from '@planpilot/shared';
import type { PlanDto, PlanInput } from '@planpilot/shared';
import { ApiError } from '../../utils/api-error';
import { logActivity } from '../activity/activity.service';
import { SubscriptionModel } from '../subscriptions/subscription.model';
import { PlanModel } from './plan.model';
import type { Plan } from './plan.model';
import { toPlanDto } from './plan.serializer';

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'plan';

async function uniqueSlug(name: string, ignoreId?: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; n < 100; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const taken = await PlanModel.exists({ slug, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) });
    if (!taken) return slug;
  }
  throw ApiError.conflict('Could not create a unique plan slug');
}

/** Only one plan carries the "Most popular" badge at a time. */
async function clearOtherPopular(exceptId: string) {
  await PlanModel.updateMany({ _id: { $ne: exceptId }, isPopular: true }, { isPopular: false });
}

export async function listActivePlans(): Promise<PlanDto[]> {
  const plans = await PlanModel.find({ isActive: true }).sort({ tier: 1, price: 1 }).lean<Plan[]>();
  return plans.map(toPlanDto);
}

export async function findPlanOrThrow(planId: string, { activeOnly = true } = {}) {
  const plan = await PlanModel.findById(planId).lean<Plan>();
  if (!plan) throw ApiError.notFound('That plan does not exist', ERROR_CODES.PLAN_NOT_FOUND);
  if (activeOnly && !plan.isActive) {
    throw ApiError.badRequest('That plan is no longer available', ERROR_CODES.PLAN_INACTIVE);
  }
  return plan;
}

export async function listPlansForAdmin(): Promise<(PlanDto & { activeSubscribers: number })[]> {
  const [plans, counts] = await Promise.all([
    PlanModel.find().sort({ isActive: -1, tier: 1, price: 1 }).lean<Plan[]>(),
    SubscriptionModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { status: 'active' } },
      { $group: { _id: '$planId', count: { $sum: 1 } } },
    ]),
  ]);
  const byPlan = new Map(counts.map((c) => [String(c._id), c.count]));
  return plans.map((plan) => ({
    ...toPlanDto(plan),
    activeSubscribers: byPlan.get(plan._id.toString()) ?? 0,
  }));
}

export async function createPlan(input: PlanInput, actorId: string): Promise<PlanDto> {
  const plan = await PlanModel.create({ ...input, slug: await uniqueSlug(input.name) });
  if (plan.isPopular) await clearOtherPopular(plan._id.toString());
  await logActivity({
    actorId,
    action: 'admin.plan.created',
    target: { type: 'plan', id: plan._id.toString(), label: plan.name },
  });
  return toPlanDto(plan.toObject());
}

export async function updatePlan(id: string, input: PlanInput, actorId: string): Promise<PlanDto> {
  const existing = await PlanModel.findById(id);
  if (!existing) throw ApiError.notFound('That plan does not exist', ERROR_CODES.PLAN_NOT_FOUND);
  const slug = existing.name === input.name ? existing.slug : await uniqueSlug(input.name, id);
  existing.set({ ...input, slug });
  await existing.save();
  if (existing.isPopular) await clearOtherPopular(id);
  await logActivity({
    actorId,
    action: 'admin.plan.updated',
    target: { type: 'plan', id, label: existing.name },
  });
  return toPlanDto(existing.toObject());
}

/** Plans with subscription history are archived, never deleted, so history stays intact. */
export async function removePlan(
  id: string,
  actorId: string,
): Promise<{ deleted: boolean; archived: boolean }> {
  const plan = await PlanModel.findById(id);
  if (!plan) throw ApiError.notFound('That plan does not exist', ERROR_CODES.PLAN_NOT_FOUND);
  const inUse = await SubscriptionModel.exists({ planId: plan._id });
  if (inUse) {
    plan.isActive = false;
    plan.isPopular = false;
    await plan.save();
    await logActivity({
      actorId,
      action: 'admin.plan.archived',
      target: { type: 'plan', id, label: plan.name },
    });
    return { deleted: false, archived: true };
  }
  await plan.deleteOne();
  await logActivity({
    actorId,
    action: 'admin.plan.deleted',
    target: { type: 'plan', id, label: plan.name },
  });
  return { deleted: true, archived: false };
}
