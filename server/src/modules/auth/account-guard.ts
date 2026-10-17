import { ERROR_CODES } from '@planpilot/shared';
import { getConfig } from '../../config/env';
import { ApiError } from '../../utils/api-error';
import { formatDate } from '../../utils/format';

interface AccountState {
  status: string;
  statusReason?: string | null;
  accessExpiresAt?: Date | null;
}

/**
 * Throws the specific 403 for an account an admin has restricted. Called after the
 * password check at login (so strangers learn nothing), on every refresh, and on
 * every authenticated request (so a block takes effect immediately).
 */
export function assertAccountUsable(user: AccountState): void {
  const supportEmail = getConfig().supportEmail;
  const reason = user.statusReason ?? null;

  if (user.status === 'blocked') {
    throw ApiError.forbidden(
      'Your access has been blocked by an administrator.',
      ERROR_CODES.ACCOUNT_BLOCKED,
      {
        reason,
        supportEmail,
      },
    );
  }
  if (user.status === 'inactive') {
    throw ApiError.forbidden('Your account is inactive.', ERROR_CODES.ACCOUNT_INACTIVE, {
      reason,
      supportEmail,
    });
  }
  if (user.accessExpiresAt && new Date(user.accessExpiresAt).getTime() <= Date.now()) {
    throw ApiError.forbidden(
      `Your access expired on ${formatDate(user.accessExpiresAt)}.`,
      ERROR_CODES.ACCOUNT_ACCESS_EXPIRED,
      { expiredAt: new Date(user.accessExpiresAt).toISOString(), reason, supportEmail },
    );
  }
}
