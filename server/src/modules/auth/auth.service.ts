import { ERROR_CODES } from '@planpilot/shared';
import type { AuthResponse, LoginInput, RegisterInput, SessionDto } from '@planpilot/shared';
import bcrypt from 'bcryptjs';
import type { Types } from 'mongoose';
import type { AppConfig } from '../../config/env';
import { ApiError } from '../../utils/api-error';
import { hashToken, newFamilyId, newRefreshToken, signAccessToken } from '../../utils/tokens';
import { TtlCache } from '../../utils/ttl-cache';
import { logActivity } from '../activity/activity.service';
import { notify } from '../notifications/notification.service';
import { UserModel } from '../users/user.model';
import type { UserDocument } from '../users/user.model';
import { toUserDto } from '../users/user.serializer';
import { assertAccountUsable } from './account-guard';
import { SessionModel } from './session.model';

const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60_000;
/** A rotated token presented again this soon is a second tab racing, not theft. */
const ROTATION_GRACE_MS = 30_000;

export interface ClientInfo {
  userAgent: string;
}

export interface IssuedSession {
  auth: AuthResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

// ---------- helpers ----------

let dummyHash: Promise<string> | undefined;
/** Compared against when the email is unknown, so timing doesn't reveal which emails exist. */
const getDummyHash = (rounds: number) =>
  (dummyHash ??= bcrypt.hash('planpilot-dummy-password', rounds));

/**
 * Failed attempts for emails that have no account. Tracking them the same way as real
 * accounts means the responses (and the lockout) look identical either way.
 */
const unknownEmailAttempts = new TtlCache<string, { failed: number; lockUntil: number }>(
  LOCK_MS,
  10_000,
);

const invalidCredentials = (attemptsLeft: number) =>
  new ApiError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Email or password is incorrect.', undefined, {
    attemptsLeft,
  });

const lockedError = (lockUntil: number) => {
  const seconds = Math.max(1, Math.ceil((lockUntil - Date.now()) / 1000));
  const minutes = Math.ceil(seconds / 60);
  return ApiError.tooMany(
    `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    ERROR_CODES.ACCOUNT_LOCKED,
    { retryAfterSeconds: seconds },
  );
};

const deviceLabel = (userAgent: string) => userAgent.slice(0, 300) || 'Unknown device';

async function issueSession(
  config: AppConfig,
  user: UserDocument,
  client: ClientInfo,
  familyId = newFamilyId(),
): Promise<IssuedSession> {
  const refreshToken = newRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60_000);
  await SessionModel.create({
    userId: user._id,
    familyId,
    tokenHash: hashToken(refreshToken),
    userAgent: deviceLabel(client.userAgent),
    expiresAt: refreshExpiresAt,
  });

  const now = new Date();
  await UserModel.updateOne({ _id: user._id }, { lastSeenAt: now });
  user.lastSeenAt = now;

  const access = signAccessToken(config, {
    sub: user._id.toString(),
    role: user.role,
    sid: familyId,
  });
  return {
    auth: {
      user: toUserDto(user),
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
    },
    refreshToken,
    refreshExpiresAt,
  };
}

// ---------- public API ----------

export async function register(config: AppConfig, input: RegisterInput, client: ClientInfo) {
  if (await UserModel.exists({ email: input.email })) {
    throw ApiError.conflict('An account with this email already exists.', ERROR_CODES.EMAIL_TAKEN);
  }
  const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
  let user: UserDocument;
  try {
    user = await UserModel.create({ name: input.name, email: input.email, passwordHash });
  } catch (error) {
    // Two sign-ups with the same email at the same moment: the unique index decides.
    if ((error as { code?: number }).code === 11000) {
      throw ApiError.conflict(
        'An account with this email already exists.',
        ERROR_CODES.EMAIL_TAKEN,
      );
    }
    throw error;
  }

  await notify(user._id, 'welcome');
  await logActivity({
    actorId: user._id,
    action: 'auth.registered',
    target: { type: 'user', id: user._id.toString(), label: user.email },
  });
  return issueSession(config, user, client);
}

export async function login(config: AppConfig, input: LoginInput, client: ClientInfo) {
  const user = await UserModel.findOne({ email: input.email }).select(
    '+passwordHash +failedLogins +lockUntil',
  );

  if (!user) {
    const entry = unknownEmailAttempts.get(input.email) ?? { failed: 0, lockUntil: 0 };
    if (entry.lockUntil > Date.now()) throw lockedError(entry.lockUntil);
    await bcrypt.compare(input.password, await getDummyHash(config.bcryptRounds));
    entry.failed += 1;
    if (entry.failed >= MAX_FAILED_LOGINS) {
      unknownEmailAttempts.set(input.email, { failed: 0, lockUntil: Date.now() + LOCK_MS });
      throw lockedError(Date.now() + LOCK_MS);
    }
    unknownEmailAttempts.set(input.email, entry);
    throw invalidCredentials(MAX_FAILED_LOGINS - entry.failed);
  }

  if (user.lockUntil && user.lockUntil.getTime() > Date.now())
    throw lockedError(user.lockUntil.getTime());

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordOk) {
    const failed = (user.failedLogins ?? 0) + 1;
    if (failed >= MAX_FAILED_LOGINS) {
      user.failedLogins = 0;
      user.lockUntil = new Date(Date.now() + LOCK_MS);
      await user.save();
      await logActivity({
        actorId: user._id,
        action: 'security.account_locked',
        target: { type: 'user', id: user._id.toString(), label: user.email },
      });
      throw lockedError(user.lockUntil.getTime());
    }
    user.failedLogins = failed;
    await user.save();
    throw invalidCredentials(MAX_FAILED_LOGINS - failed);
  }

  if (user.failedLogins || user.lockUntil) {
    user.failedLogins = 0;
    user.lockUntil = null;
    await user.save();
  }

  // Only now, with the right password, is it safe to say why the account can't sign in.
  assertAccountUsable(user);

  await logActivity({
    actorId: user._id,
    action: 'auth.login',
    target: { type: 'user', id: user._id.toString(), label: user.email },
  });
  return issueSession(config, user, client);
}

export async function revokeFamily(familyId: string, reason: string): Promise<void> {
  await SessionModel.updateMany(
    { familyId, revokedAt: null },
    { revokedAt: new Date(), revokedReason: reason },
  );
}

export async function revokeUserSessions(
  userId: Types.ObjectId | string,
  reason: string,
  exceptFamilyId?: string,
): Promise<number> {
  const filter: Record<string, unknown> = { userId, revokedAt: null };
  if (exceptFamilyId) filter.familyId = { $ne: exceptFamilyId };
  const result = await SessionModel.updateMany(filter, {
    revokedAt: new Date(),
    revokedReason: reason,
  });
  return result.modifiedCount;
}

export async function refresh(
  config: AppConfig,
  presented: string | undefined,
  client: ClientInfo,
) {
  const expired = () =>
    ApiError.unauthorized(
      'Your session has ended. Please sign in again.',
      ERROR_CODES.SESSION_EXPIRED,
    );
  if (!presented) throw expired();

  const session = await SessionModel.findOne({ tokenHash: hashToken(presented) });
  if (!session || session.expiresAt.getTime() <= Date.now()) throw expired();

  const newToken = newRefreshToken();
  const newHash = hashToken(newToken);
  // Atomic: only one request can rotate a given token.
  const rotated = await SessionModel.findOneAndUpdate(
    { _id: session._id, revokedAt: null },
    {
      revokedAt: new Date(),
      revokedReason: 'rotated',
      replacedByHash: newHash,
      lastUsedAt: new Date(),
    },
  );

  if (!rotated) {
    const latest = await SessionModel.findById(session._id);
    const racing =
      latest?.revokedReason === 'rotated' &&
      latest.revokedAt &&
      Date.now() - latest.revokedAt.getTime() < ROTATION_GRACE_MS;
    if (racing) {
      // The browser already holds the newer cookie; the client retries once.
      throw new ApiError(
        401,
        ERROR_CODES.SESSION_EXPIRED,
        'Session was refreshed in another tab.',
        undefined,
        {
          retry: true,
        },
      );
    }
    await revokeFamily(session.familyId, 'reuse_detected');
    await logActivity({
      actorId: session.userId,
      action: 'security.refresh_token_reuse',
      target: { type: 'user', id: session.userId.toString(), label: 'refresh token reuse' },
      meta: { familyId: session.familyId },
    });
    throw expired();
  }

  const user = await UserModel.findById(session.userId);
  if (!user) {
    await revokeFamily(session.familyId, 'user_missing');
    throw expired();
  }
  try {
    assertAccountUsable(user);
  } catch (error) {
    await revokeFamily(session.familyId, 'account_restricted');
    throw error;
  }

  const refreshExpiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60_000);
  await SessionModel.create({
    userId: user._id,
    familyId: session.familyId,
    tokenHash: newHash,
    userAgent: deviceLabel(client.userAgent || session.userAgent),
    expiresAt: refreshExpiresAt,
  });
  const access = signAccessToken(config, {
    sub: user._id.toString(),
    role: user.role,
    sid: session.familyId,
  });
  return {
    auth: {
      user: toUserDto(user),
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
    },
    refreshToken: newToken,
    refreshExpiresAt,
  } satisfies IssuedSession;
}

export async function logout(presented: string | undefined): Promise<void> {
  if (!presented) return;
  const session = await SessionModel.findOne({ tokenHash: hashToken(presented) }).select(
    'familyId',
  );
  if (session) await revokeFamily(session.familyId, 'logout');
}

export async function listSessions(userId: string, currentFamilyId: string): Promise<SessionDto[]> {
  const sessions = await SessionModel.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastUsedAt: -1 })
    .lean();
  return sessions.map((s) => ({
    id: s.familyId,
    userAgent: s.userAgent,
    createdAt: (s.createdAt as Date).toISOString(),
    lastUsedAt: s.lastUsedAt.toISOString(),
    current: s.familyId === currentFamilyId,
  }));
}

export async function isSessionActive(familyId: string): Promise<boolean> {
  return Boolean(
    await SessionModel.exists({ familyId, revokedAt: null, expiresAt: { $gt: new Date() } }),
  );
}
