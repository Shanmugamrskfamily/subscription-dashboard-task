import type { Role, UserDto, UserStatus } from '@planpilot/shared';
import type { Types } from 'mongoose';

export interface UserLike {
  _id: Types.ObjectId;
  name: string;
  email: string;
  role: string;
  status: string;
  statusReason?: string | null;
  accessExpiresAt?: Date | null;
  lastSeenAt?: Date | null;
  createdAt?: Date | null;
}

export const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : null);

/** The only shape a user ever leaves the API in: no hash, counters or lock state. */
export function toUserDto(user: UserLike): UserDto {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role as Role,
    status: user.status as UserStatus,
    statusReason: user.statusReason ?? null,
    accessExpiresAt: iso(user.accessExpiresAt),
    lastSeenAt: iso(user.lastSeenAt),
    createdAt: iso(user.createdAt) ?? new Date(0).toISOString(),
  };
}
