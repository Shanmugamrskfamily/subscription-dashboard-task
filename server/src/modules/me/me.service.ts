import { ERROR_CODES } from '@planpilot/shared';
import type { ChangePasswordInput, UpdateProfileInput, UserDto } from '@planpilot/shared';
import bcrypt from 'bcryptjs';
import type { AppConfig } from '../../config/env';
import { ApiError } from '../../utils/api-error';
import { logActivity } from '../activity/activity.service';
import { revokeFamily, revokeUserSessions } from '../auth/auth.service';
import { SessionModel } from '../auth/session.model';
import { UserModel } from '../users/user.model';
import { toUserDto } from '../users/user.serializer';

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<UserDto> {
  const user = await UserModel.findByIdAndUpdate(
    userId,
    { name: input.name },
    { returnDocument: 'after' },
  ).lean();
  if (!user) throw ApiError.unauthorized();
  return toUserDto(user);
}

/** Changing the password signs every other device out; this one stays signed in. */
export async function changePassword(
  config: AppConfig,
  user: { id: string; sid: string; email: string },
  input: ChangePasswordInput,
): Promise<{ otherSessionsRevoked: number }> {
  const record = await UserModel.findById(user.id).select('+passwordHash');
  if (!record) throw ApiError.unauthorized();
  if (!(await bcrypt.compare(input.currentPassword, record.passwordHash))) {
    throw new ApiError(400, ERROR_CODES.WRONG_PASSWORD, 'Your current password is not correct.', [
      { field: 'currentPassword', message: 'Your current password is not correct' },
    ]);
  }
  record.passwordHash = await bcrypt.hash(input.newPassword, config.bcryptRounds);
  record.passwordChangedAt = new Date();
  await record.save();

  const otherSessionsRevoked = await revokeUserSessions(user.id, 'password_changed', user.sid);
  await logActivity({
    actorId: user.id,
    action: 'auth.password_changed',
    target: { type: 'user', id: user.id, label: user.email },
  });
  return { otherSessionsRevoked };
}

export async function revokeMySession(userId: string, familyId: string): Promise<void> {
  const exists = await SessionModel.exists({ userId, familyId, revokedAt: null });
  if (!exists) throw ApiError.notFound('That session is no longer active');
  await revokeFamily(familyId, 'revoked_by_user');
}
