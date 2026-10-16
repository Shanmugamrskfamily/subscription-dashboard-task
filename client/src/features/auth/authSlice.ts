import type { AuthResponse, ErrorCode, UserDto } from '@planpilot/shared';
import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous';

/** Why an admin stopped this account; shown as a banner on the login page. */
export interface AccountRestriction {
  code: ErrorCode;
  message: string;
  reason: string | null;
  supportEmail: string | null;
  expiredAt: string | null;
}

export type EndReason = 'signed-out' | 'expired' | 'idle' | 'restricted' | 'elsewhere';

export interface AuthState {
  status: AuthStatus;
  user: UserDto | null;
  /** Lives only in memory: a page reload restores it through the refresh cookie. */
  accessToken: string | null;
  expiresAt: string | null;
  restriction: AccountRestriction | null;
  endReason: EndReason | null;
}

const initialState: AuthState = {
  status: 'restoring',
  user: null,
  accessToken: null,
  expiresAt: null,
  restriction: null,
  endReason: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionStarted(state, action: PayloadAction<AuthResponse>) {
      state.status = 'authenticated';
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.expiresAt = action.payload.accessTokenExpiresAt;
      state.restriction = null;
      state.endReason = null;
    },
    userUpdated(state, action: PayloadAction<UserDto>) {
      state.user = action.payload;
    },
    restoreFinished(state) {
      if (state.status === 'restoring') state.status = 'anonymous';
    },
    sessionEnded(state, action: PayloadAction<EndReason>) {
      state.status = 'anonymous';
      state.user = null;
      state.accessToken = null;
      state.expiresAt = null;
      state.endReason = action.payload;
    },
    accountRestricted(state, action: PayloadAction<AccountRestriction>) {
      state.restriction = action.payload;
    },
    restrictionCleared(state) {
      state.restriction = null;
    },
    endReasonCleared(state) {
      state.endReason = null;
    },
  },
});

export const {
  sessionStarted,
  userUpdated,
  restoreFinished,
  sessionEnded,
  accountRestricted,
  restrictionCleared,
  endReasonCleared,
} = authSlice.actions;
export const authReducer = authSlice.reducer;
