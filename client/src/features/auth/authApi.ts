import type {
  AuthResponse,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  SessionDto,
  UpdateProfileInput,
  UserDto,
} from '@planpilot/shared';
import { api } from '../../api/apiSlice';
import { broadcast } from '../../lib/broadcast';
import { sessionEnded, sessionStarted, userUpdated } from './authSlice';

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<AuthResponse, LoginInput>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(api.util.resetApiState());
        dispatch(sessionStarted(data));
        broadcast({ type: 'signed-in' });
      },
    }),
    register: build.mutation<AuthResponse, RegisterInput>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(api.util.resetApiState());
        dispatch(sessionStarted(data));
        broadcast({ type: 'signed-in' });
      },
    }),
    logout: build.mutation<{ loggedOut: boolean }, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        // Sign out locally even if the network call fails.
        try {
          await queryFulfilled;
        } finally {
          dispatch(sessionEnded('signed-out'));
          dispatch(api.util.resetApiState());
          broadcast({ type: 'signed-out' });
        }
      },
    }),
    updateProfile: build.mutation<UserDto, UpdateProfileInput>({
      query: (body) => ({ url: '/me/profile', method: 'PATCH', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled;
        dispatch(userUpdated(data));
      },
    }),
    changePassword: build.mutation<{ otherSessionsRevoked: number }, ChangePasswordInput>({
      query: (body) => ({ url: '/me/password', method: 'POST', body }),
      invalidatesTags: ['Sessions'],
    }),
    sessions: build.query<SessionDto[], void>({
      query: () => ({ url: '/me/sessions' }),
      providesTags: ['Sessions'],
    }),
    revokeSession: build.mutation<{ revoked: boolean }, string>({
      query: (id) => ({ url: `/me/sessions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Sessions'],
    }),
    signOutEverywhere: build.mutation<{ revoked: number }, void>({
      query: () => ({ url: '/me/sessions', method: 'DELETE' }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          dispatch(sessionEnded('signed-out'));
          dispatch(api.util.resetApiState());
          broadcast({ type: 'signed-out' });
        }
      },
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useUpdateProfileMutation,
  useChangePasswordMutation,
  useSessionsQuery,
  useRevokeSessionMutation,
  useSignOutEverywhereMutation,
} = authApi;
