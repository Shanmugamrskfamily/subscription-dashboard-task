import type { NotificationListDto, PageMeta } from '@planpilot/shared';
import { api } from '../../api/apiSlice';

export const notificationsApi = api.injectEndpoints({
  endpoints: (build) => ({
    notifications: build.query<
      NotificationListDto & { meta?: PageMeta },
      { unread?: boolean; page?: number } | void
    >({
      query: (args) => ({
        url: '/notifications',
        params: { unread: args?.unread ?? false, page: args?.page ?? 1 },
      }),
      transformResponse: (data: NotificationListDto, meta: { page?: PageMeta } | undefined) => ({
        ...data,
        meta: meta?.page,
      }),
      providesTags: ['Notifications'],
    }),
    markNotificationRead: build.mutation<{ read: boolean }, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'PATCH' }),
      // Optimistic: the dot disappears at once; the refetch confirms it.
      async onQueryStarted(id, { dispatch, queryFulfilled, getState }) {
        const patches = notificationsApi.util
          .selectInvalidatedBy(getState(), ['Notifications'])
          .map(({ originalArgs }) =>
            dispatch(
              notificationsApi.util.updateQueryData(
                'notifications',
                originalArgs as never,
                (draft) => {
                  const item = draft.items.find((n) => n.id === id);
                  if (item && !item.readAt) {
                    item.readAt = new Date().toISOString();
                    draft.unread = Math.max(0, draft.unread - 1);
                  }
                },
              ),
            ),
          );
        try {
          await queryFulfilled;
        } catch {
          patches.forEach((p) => p.undo());
        }
      },
      invalidatesTags: ['Notifications'],
    }),
    markAllNotificationsRead: build.mutation<{ updated: number }, void>({
      query: () => ({ url: '/notifications/read-all', method: 'PATCH' }),
      invalidatesTags: ['Notifications'],
    }),
  }),
});

export const {
  useNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationsApi;
