import { object, ref, string } from 'yup';
import type { InferType } from 'yup';
import { PASSWORD_MAX } from '../constants';
import { nameField, passwordField } from './common';

export const updateProfileSchema = object({
  name: nameField(),
}).noUnknown();

export const changePasswordSchema = object({
  currentPassword: string()
    .required('Enter your current password')
    .max(PASSWORD_MAX, 'Password is too long'),
  newPassword: passwordField().notOneOf(
    [ref('currentPassword')],
    'New password must differ from the current one',
  ),
}).noUnknown();

export const changePasswordFormSchema = changePasswordSchema.shape({
  confirmPassword: string()
    .required('Confirm the new password')
    .oneOf([ref('newPassword')], 'Passwords do not match'),
});

export type UpdateProfileInput = InferType<typeof updateProfileSchema>;
export type ChangePasswordInput = InferType<typeof changePasswordSchema>;
export type ChangePasswordFormValues = InferType<typeof changePasswordFormSchema>;
