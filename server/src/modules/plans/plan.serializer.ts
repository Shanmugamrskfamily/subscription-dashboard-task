import type { PlanDto, PlanLimits, PlanSummary } from '@planpilot/shared';
import type { Plan } from './plan.model';

const limitValue = (value: number | null | undefined) => (value === undefined ? null : value);

export function planLimits(plan: Pick<Plan, 'limits'> | null | undefined): PlanLimits {
  if (!plan) return { projects: 0, teamMembers: 0 };
  return {
    projects: limitValue(plan.limits?.projects),
    teamMembers: limitValue(plan.limits?.teamMembers),
  };
}

export function toPlanDto(plan: Plan): PlanDto {
  return {
    id: plan._id.toString(),
    name: plan.name,
    slug: plan.slug,
    description: plan.description ?? '',
    price: plan.price,
    currency: 'INR',
    durationDays: plan.durationDays,
    features: [...(plan.features ?? [])],
    limits: planLimits(plan),
    tier: plan.tier,
    isPopular: plan.isPopular ?? false,
    isActive: plan.isActive ?? true,
  };
}

export function toPlanSummary(plan: Pick<Plan, '_id' | 'name' | 'slug'>): PlanSummary {
  return { id: plan._id.toString(), name: plan.name, slug: plan.slug };
}
