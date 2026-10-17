import type { ActivityDto } from '@planpilot/shared';
import type { ClientSession, Types } from 'mongoose';
import { logger } from '../../utils/logger';
import { ActivityModel } from './activity.model';

export interface ActivityInput {
  actorId?: Types.ObjectId | string | null;
  action: string;
  target?: { type: string; id: string; label: string } | null;
  meta?: Record<string, unknown> | null;
}

/** Records an audit entry. A logging failure must never fail the action itself. */
export async function logActivity(entry: ActivityInput, session?: ClientSession): Promise<void> {
  try {
    await ActivityModel.create([{ ...entry, actorId: entry.actorId ?? null }], { session });
  } catch (error) {
    logger.error({ err: error, action: entry.action }, 'Could not record activity');
  }
}

export async function recentActivity(
  filter: Record<string, unknown> = {},
  limit = 20,
): Promise<ActivityDto[]> {
  const rows = await ActivityModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate<{ actorId: { _id: Types.ObjectId; name: string } | null }>('actorId', 'name')
    .lean();

  return rows.map((row) => ({
    id: row._id.toString(),
    actor: row.actorId ? { id: row.actorId._id.toString(), name: row.actorId.name } : null,
    action: row.action,
    target: row.target?.id
      ? { type: row.target.type ?? '', id: row.target.id, label: row.target.label ?? '' }
      : null,
    meta: (row.meta as Record<string, unknown> | null) ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
  }));
}
