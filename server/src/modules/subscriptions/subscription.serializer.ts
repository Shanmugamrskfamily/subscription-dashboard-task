import { DAY_MS } from '@planpilot/shared';
import type {
  AdminSubscriptionRow,
  ChangeType,
  SubscriptionAdjustment,
  SubscriptionDto,
  SubscriptionStatus,
} from '@planpilot/shared';
import type { Types } from 'mongoose';
import type { Plan } from '../plans/plan.model';
import { toPlanDto, toPlanSummary } from '../plans/plan.serializer';
import type { Subscription } from './subscription.model';

type AdjustmentLike = Subscription['adjustments'][number] & {
  by?: Types.ObjectId | { _id: Types.ObjectId; name: string } | null;
};

const isPopulatedUser = (by: unknown): by is { _id: Types.ObjectId; name: string } =>
  Boolean(by && typeof by === 'object' && 'name' in by);

function toAdjustment(a: AdjustmentLike): SubscriptionAdjustment {
  return {
    type: a.type as SubscriptionAdjustment['type'],
    days: a.days ?? null,
    newEndDate: a.newEndDate ? new Date(a.newEndDate).toISOString() : null,
    reason: a.reason,
    by: isPopulatedUser(a.by) ? { id: a.by._id.toString(), name: a.by.name } : null,
    at: new Date(a.at ?? Date.now()).toISOString(),
  };
}

export function daysLeft(endDate: Date, now = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(endDate).getTime() - now) / DAY_MS));
}

export function toSubscriptionDto(sub: Subscription, plan: Plan): SubscriptionDto {
  const start = new Date(sub.startDate).getTime();
  const end = new Date(sub.endDate).getTime();
  return {
    id: sub._id.toString(),
    plan: toPlanDto(plan),
    status: sub.status as SubscriptionStatus,
    startDate: new Date(sub.startDate).toISOString(),
    endDate: new Date(sub.endDate).toISOString(),
    amountPaid: sub.amountPaid ?? 0,
    changeType: sub.changeType as ChangeType,
    cancelledAt:
      sub.endedAt && sub.status !== 'active' ? new Date(sub.endedAt).toISOString() : null,
    daysLeft: sub.status === 'active' ? daysLeft(sub.endDate) : 0,
    totalDays: Math.max(1, Math.round((end - start) / DAY_MS)),
    adjustments: (sub.adjustments ?? []).map((a) => toAdjustment(a as AdjustmentLike)),
    createdAt: new Date(sub.createdAt).toISOString(),
  };
}

export interface AdminRowSource {
  _id: Types.ObjectId;
  userId: { _id: Types.ObjectId; name: string; email: string } | null;
  planId: Pick<Plan, '_id' | 'name' | 'slug'> | null;
  status: string;
  startDate: Date;
  endDate: Date;
  amountPaid: number;
  changeType: string;
  createdAt: Date;
}

export function toAdminRow(row: AdminRowSource): AdminSubscriptionRow {
  return {
    id: row._id.toString(),
    user: row.userId
      ? { id: row.userId._id.toString(), name: row.userId.name, email: row.userId.email }
      : { id: '', name: 'Deleted user', email: '' },
    plan: row.planId ? toPlanSummary(row.planId) : { id: '', name: 'Deleted plan', slug: '' },
    status: row.status as SubscriptionStatus,
    startDate: new Date(row.startDate).toISOString(),
    endDate: new Date(row.endDate).toISOString(),
    amountPaid: row.amountPaid ?? 0,
    changeType: row.changeType as ChangeType,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}
