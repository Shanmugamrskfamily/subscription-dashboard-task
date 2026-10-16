import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQueryWithReauth } from './baseQuery';

/**
 * One RTK Query API. Feature folders inject their endpoints, and tags keep related
 * screens in sync (subscribing refreshes the dashboard, the bell, billing and usage).
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  refetchOnReconnect: true,
  tagTypes: [
    'Me',
    'Plans',
    'MySubscription',
    'Payments',
    'Projects',
    'Team',
    'Notifications',
    'Sessions',
    'AdminStats',
    'AdminSubscriptions',
    'AdminUsers',
    'AdminUser',
    'AdminPlans',
    'Activity',
  ],
  endpoints: () => ({}),
});
