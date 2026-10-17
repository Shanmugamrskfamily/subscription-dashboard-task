import { boolean, date, number, object, string } from 'yup';
import type { InferType } from 'yup';
import {
  ADMIN_RANGES,
  CHANGE_TYPES,
  ROLES,
  SUBSCRIPTION_STATUSES,
  USER_STATUSES,
} from '../constants';
import { objectIdField, pageField, pageSizeField, reasonField, searchField } from './common';

const emptyToUndefined = (value: unknown) => (value === '' || value === null ? undefined : value);

export const SUBSCRIPTION_SORTS = [
  '-createdAt',
  'createdAt',
  '-startDate',
  'startDate',
  '-endDate',
  'endDate',
  '-amountPaid',
  'amountPaid',
] as const;

export const USER_SORTS = ['-createdAt', 'createdAt', 'name', '-name', '-lastSeenAt'] as const;

export const adminSubscriptionQuerySchema = object({
  page: pageField(),
  pageSize: pageSizeField(),
  search: searchField(),
  status: string()
    .oneOf([...SUBSCRIPTION_STATUSES, 'all'])
    .default('all'),
  planId: objectIdField('plan id').transform(emptyToUndefined).optional(),
  changeType: string()
    .oneOf([...CHANGE_TYPES, 'all'])
    .default('all'),
  from: date().transform(emptyToUndefined).typeError('Invalid start date').optional(),
  to: date()
    .transform(emptyToUndefined)
    .typeError('Invalid end date')
    .optional()
    .test('after-from', 'End date must be after the start date', function check(to) {
      const { from } = this.parent as { from?: Date };
      return !to || !from || to >= from;
    }),
  sort: string()
    .oneOf([...SUBSCRIPTION_SORTS])
    .default('-createdAt'),
  format: string().oneOf(['json', 'csv']).default('json'),
}).noUnknown();

export const adminUserQuerySchema = object({
  page: pageField(),
  pageSize: pageSizeField(),
  search: searchField(),
  role: string()
    .oneOf([...ROLES, 'all'])
    .default('all'),
  status: string()
    .oneOf([...USER_STATUSES, 'all'])
    .default('all'),
  subscription: string()
    .oneOf([...SUBSCRIPTION_STATUSES, 'none', 'all'])
    .default('all'),
  sort: string()
    .oneOf([...USER_SORTS])
    .default('-createdAt'),
}).noUnknown();

export const userStatusSchema = object({
  status: string()
    .oneOf([...USER_STATUSES], 'Pick a status')
    .required('Pick a status'),
  reason: reasonField(),
  accessExpiresAt: date()
    .transform(emptyToUndefined)
    .typeError('Invalid date')
    .nullable()
    .default(null)
    .test('future', 'Pick a date in the future', (value) => !value || value.getTime() > Date.now()),
}).noUnknown();

export const extendSubscriptionSchema = object({
  days: number()
    .transform(emptyToUndefined)
    .typeError('Days must be a number')
    .integer('Use whole days')
    .min(1, 'Extend by at least 1 day')
    .max(3650, 'Extend by at most 10 years')
    .optional(),
  endDate: date().transform(emptyToUndefined).typeError('Invalid date').optional(),
  reason: reasonField(),
})
  .noUnknown()
  .test('days-or-date', 'Give either a number of days or a new end date', (value) => {
    const hasDays = value.days != null;
    const hasDate = value.endDate != null;
    return hasDays !== hasDate;
  });

export const reasonOnlySchema = object({
  reason: reasonField(),
}).noUnknown();

export const assignPlanSchema = object({
  planId: objectIdField('plan id').required('Pick a plan'),
  reason: reasonField(),
}).noUnknown();

export const roleSchema = object({
  role: string()
    .oneOf([...ROLES], 'Pick a role')
    .required('Pick a role'),
}).noUnknown();

export const statsQuerySchema = object({
  range: string()
    .oneOf([...ADMIN_RANGES])
    .default('30d'),
}).noUnknown();

export const idParamsSchema = object({
  id: objectIdField().required('Id is required'),
}).noUnknown();

export const notificationQuerySchema = object({
  unread: boolean().default(false),
  page: pageField(),
}).noUnknown();

export type AdminSubscriptionQuery = InferType<typeof adminSubscriptionQuerySchema>;
export type AdminUserQuery = InferType<typeof adminUserQuerySchema>;
export type UserStatusInput = InferType<typeof userStatusSchema>;
export type ExtendSubscriptionInput = InferType<typeof extendSubscriptionSchema>;
export type AssignPlanInput = InferType<typeof assignPlanSchema>;
