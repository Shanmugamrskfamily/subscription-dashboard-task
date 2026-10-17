import { ERROR_CODES as C } from '@planpilot/shared';
import * as ex from '../examples';
import { SIGNED_IN, defineOperation } from '../operation';
import { countResult, flagResult, parameterRef, schemaRef } from '../refs';

export const meOperations = [
  defineOperation({
    method: 'patch',
    path: '/me/profile',
    operationId: 'updateMyProfile',
    tag: 'Me',
    summary: 'Update my profile',
    description: 'Changes the display name. The email cannot be changed.',
    access: SIGNED_IN,
    body: { schema: schemaRef('UpdateProfileRequest'), example: { name: 'Priya S. Sharma' } },
    success: {
      description: 'The updated user.',
      data: schemaRef('User'),
      example: { ...ex.user, name: 'Priya S. Sharma' },
    },
  }),

  defineOperation({
    method: 'post',
    path: '/me/password',
    operationId: 'changeMyPassword',
    tag: 'Me',
    summary: 'Change my password',
    description:
      'Checks the current password, stores the new one and signs out every other device. This session stays signed in.',
    access: SIGNED_IN,
    body: {
      schema: schemaRef('ChangePasswordRequest'),
      example: { currentPassword: 'Demo@12345', newPassword: 'Brighter2026' },
    },
    success: {
      description: 'Password changed.',
      data: countResult('otherSessionsRevoked', 'Other devices that were signed out.'),
      example: { otherSessionsRevoked: 1 },
    },
    errors: [C.WRONG_PASSWORD],
  }),

  defineOperation({
    method: 'get',
    path: '/me/sessions',
    operationId: 'listMySessions',
    tag: 'Me',
    summary: 'List my signed-in devices',
    description: 'Active sessions, most recently used first. `current` marks this one.',
    access: SIGNED_IN,
    success: {
      description: 'Active sessions.',
      data: { type: 'array', items: schemaRef('Session') },
      example: ex.sessions,
    },
  }),

  defineOperation({
    method: 'delete',
    path: '/me/sessions/{id}',
    operationId: 'revokeMySession',
    tag: 'Me',
    summary: 'Sign out one device',
    description:
      'Revokes one session. Its refresh token and access tokens stop working at once. Revoking the current session signs this device out.',
    access: SIGNED_IN,
    parameters: [parameterRef('SessionId')],
    success: {
      description: 'Revoked.',
      data: flagResult('revoked', 'Always true.'),
      example: { revoked: true },
    },
    errors: [[C.NOT_FOUND, 'No active session with this id belongs to you.']],
  }),

  defineOperation({
    method: 'delete',
    path: '/me/sessions',
    operationId: 'revokeAllMySessions',
    tag: 'Me',
    summary: 'Sign out everywhere',
    description:
      'Revokes every session of the signed-in user, including this one. All refresh and access tokens stop working.',
    access: SIGNED_IN,
    success: {
      description: 'Every session revoked.',
      data: countResult('revoked', 'Sessions that were ended.'),
      example: { revoked: 2 },
    },
  }),

  defineOperation({
    method: 'get',
    path: '/me/payments',
    operationId: 'listMyPayments',
    tag: 'Me',
    summary: 'My billing history',
    description:
      'Paid and failed checkouts, newest first (the latest 50). Unfinished orders are not listed.',
    access: SIGNED_IN,
    success: {
      description: 'Payments.',
      data: { type: 'array', items: schemaRef('Payment') },
      example: ex.payments,
    },
  }),

  defineOperation({
    method: 'get',
    path: '/me/usage',
    operationId: 'getMyUsage',
    tag: 'Me',
    summary: 'My usage',
    description: 'How many projects and team members the signed-in user has.',
    access: SIGNED_IN,
    success: { description: 'Usage counters.', data: schemaRef('Usage'), example: ex.usage },
  }),
];

export const notificationOperations = [
  defineOperation({
    method: 'get',
    path: '/notifications',
    operationId: 'listNotifications',
    tag: 'Notifications',
    summary: 'List my notifications',
    description:
      'In-app notifications, newest first, 20 per page. `data.unread` is the total unread count for the badge.',
    access: SIGNED_IN,
    parameters: [parameterRef('Unread'), parameterRef('Page')],
    success: {
      description: 'A page of notifications.',
      data: schemaRef('NotificationList'),
      paged: true,
      example: ex.notifications,
      metaExample: ex.notificationsMeta,
    },
  }),

  defineOperation({
    method: 'patch',
    path: '/notifications/read-all',
    operationId: 'markAllNotificationsRead',
    tag: 'Notifications',
    summary: 'Mark all as read',
    access: SIGNED_IN,
    success: {
      description: 'Done.',
      data: countResult('updated', 'Notifications that were unread.'),
      example: { updated: 3 },
    },
  }),

  defineOperation({
    method: 'patch',
    path: '/notifications/{id}/read',
    operationId: 'markNotificationRead',
    tag: 'Notifications',
    summary: 'Mark one as read',
    description:
      'Idempotent: an id that is already read, unknown or someone else’s still returns `read: true` and changes nothing.',
    access: SIGNED_IN,
    parameters: [parameterRef('NotificationId')],
    success: {
      description: 'Done.',
      data: flagResult('read', 'Always true.'),
      example: { read: true },
    },
  }),
];
