import { object, ref, string } from 'yup';
import type { InferType } from 'yup';
import { PASSWORD_MAX } from '../constants';
import { emailField, nameField, passwordField } from './common';

export const registerSchema = object({
  name: nameField(),
  email: emailField(),
  password: passwordField(),
}).noUnknown();

/** The register form adds a confirmation field the API never sees. */
export const registerFormSchema = registerSchema.shape({
  confirmPassword: string()
    .required('Confirm your password')
    .oneOf([ref('password')], 'Passwords do not match'),
});

export const loginSchema = object({
  email: emailField(),
  // No strength rules at login: the stored password is what it is.
  password: string().required('Password is required').max(PASSWORD_MAX, 'Password is too long'),
}).noUnknown();

export type RegisterInput = InferType<typeof registerSchema>;
export type RegisterFormValues = InferType<typeof registerFormSchema>;
export type LoginInput = InferType<typeof loginSchema>;
