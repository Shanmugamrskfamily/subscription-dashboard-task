import type {
  ActivityDto,
  AdminRange,
  AdminStatsDto,
  AdminSubscriptionRow,
  AdminUserDetail,
  AdminUserRow,
  PageMeta,
  PlanDto,
  PlanInput,
  Role,
  SubscriptionDto,
} from '@planpilot/shared';
import { api } from '../../api/apiSlice';

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

export type SubscriptionFilters = Partial<{
  page: number;
  pageSize: number;
  search: string;
  status: string;
  planId: string;
  changeType: string;
  from: string;
  to: string;
  sort: string;
}>;

export type UserFilters = Partial<{
  page: number;
  pageSize: number;
  search: string;
  role: string;
  status: string;
  subscription: string;
  sort: string;
}>;

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null),
  );

const paged = <T>(data: T[], meta: { page?: PageMeta } | undefined): Paged<T> => ({
  items: data,
  meta: meta?.page ?? { page: 1, pageSize: data.length, total: data.length, totalPages: 1 },
});

/** Everything a change to one user can affect on the admin screens. */
const USER_CHANGE = [
  'AdminUsers',
  'AdminUser',
  'AdminSubscriptions',
  'AdminStats',
  'Activity',
] as const;

export const adminApi = api.injectEndpoints({
  endpoints: (build) => ({
    adminStats: build.query<AdminStatsDto, AdminRange>({
      query: (range) => ({ url: '/admin/stats', params: { range } }),
      providesTags: ['AdminStats'],
    }),
    adminSubscriptions: build.query<Paged<AdminSubscriptionRow>, SubscriptionFilters>({
      query: (filters) => ({ url: '/admin/subscriptions', params: clean(filters) }),
      transformResponse: paged<AdminSubscriptionRow>,
      providesTags: ['AdminSubscriptions'],
    }),
    exportSubscriptions: build.mutation<{ filename: string; csv: string }, SubscriptionFilters>({
      query: (filters) => ({
        url: '/admin/subscriptions',
        params: clean({ ...filters, format: 'csv', page: 1 }),
      }),
    }),
    adminUsers: build.query<Paged<AdminUserRow>, UserFilters>({
      query: (filters) => ({ url: '/admin/users', params: clean(filters) }),
      transformResponse: paged<AdminUserRow>,
      providesTags: ['AdminUsers'],
    }),
    adminUser: build.query<AdminUserDetail, string>({
      query: (id) => ({ url: `/admin/users/${id}` }),
      providesTags: (_r, _e, id) => [{ type: 'AdminUser', id }],
    }),
    setUserStatus: build.mutation<
      AdminUserRow,
      { id: string; status: string; reason: string; accessExpiresAt: string | null }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/users/${id}/status`, method: 'PATCH', body }),
      invalidatesTags: [...USER_CHANGE],
    }),
    setUserRole: build.mutation<AdminUserRow, { id: string; role: Role }>({
      query: ({ id, role }) => ({
        url: `/admin/users/${id}/role`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: [...USER_CHANGE],
    }),
    assignPlan: build.mutation<SubscriptionDto, { userId: string; planId: string; reason: string }>(
      {
        query: ({ userId, ...body }) => ({
          url: `/admin/users/${userId}/subscription`,
          method: 'POST',
          body,
        }),
        invalidatesTags: [...USER_CHANGE],
      },
    ),
    extendSubscription: build.mutation<
      SubscriptionDto,
      { id: string; days?: number; endDate?: string; reason: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/subscriptions/${id}/extend`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: [...USER_CHANGE],
    }),
    endSubscription: build.mutation<
      SubscriptionDto,
      { id: string; kind: 'expire' | 'cancel'; reason: string }
    >({
      query: ({ id, kind, reason }) => ({
        url: `/admin/subscriptions/${id}/${kind}`,
        method: 'PATCH',
        body: { reason },
      }),
      invalidatesTags: [...USER_CHANGE],
    }),
    forceSignOut: build.mutation<{ revoked: number }, string>({
      query: (id) => ({ url: `/admin/users/${id}/sessions`, method: 'DELETE' }),
      invalidatesTags: [...USER_CHANGE],
    }),
    adminPlans: build.query<(PlanDto & { activeSubscribers: number })[], void>({
      query: () => ({ url: '/admin/plans' }),
      providesTags: ['AdminPlans'],
    }),
    createPlan: build.mutation<PlanDto, PlanInput>({
      query: (body) => ({ url: '/admin/plans', method: 'POST', body }),
      invalidatesTags: ['AdminPlans', 'Plans', 'Activity'],
    }),
    updatePlan: build.mutation<PlanDto, { id: string; body: PlanInput }>({
      query: ({ id, body }) => ({ url: `/admin/plans/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['AdminPlans', 'Plans', 'Activity', 'AdminStats'],
    }),
    deletePlan: build.mutation<{ deleted: boolean; archived: boolean }, string>({
      query: (id) => ({ url: `/admin/plans/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminPlans', 'Plans', 'Activity', 'AdminStats'],
    }),
    activity: build.query<ActivityDto[], void>({
      query: () => ({ url: '/admin/activity' }),
      providesTags: ['Activity'],
    }),
    resetDemo: build.mutation<{ reset: boolean }, void>({
      query: () => ({ url: '/admin/demo/reset', method: 'POST' }),
      invalidatesTags: [...USER_CHANGE, 'AdminPlans', 'Plans'],
    }),
  }),
});

export const {
  useAdminStatsQuery,
  useAdminSubscriptionsQuery,
  useExportSubscriptionsMutation,
  useAdminUsersQuery,
  useAdminUserQuery,
  useSetUserStatusMutation,
  useSetUserRoleMutation,
  useAssignPlanMutation,
  useExtendSubscriptionMutation,
  useEndSubscriptionMutation,
  useForceSignOutMutation,
  useAdminPlansQuery,
  useCreatePlanMutation,
  useUpdatePlanMutation,
  useDeletePlanMutation,
  useActivityQuery,
  useResetDemoMutation,
} = adminApi;
