import { number, string } from 'yup';
import {
  NAME_MAX,
  NAME_MIN,
  PAGE_SIZES,
  PASSWORD_MAX,
  PASSWORD_MIN,
  REASON_MAX,
  REASON_MIN,
} from '../constants';
import { sanitizeText } from '../sanitize';

/** Trims, strips tags and control characters. Runs on the client (cast) and the server. */
export const cleanText = () =>
  string().transform((value: unknown) => (typeof value === 'string' ? sanitizeText(value) : value));

export const nameField = () =>
  cleanText()
    .required('Name is required')
    .min(NAME_MIN, `Name must be at least ${NAME_MIN} characters`)
    .max(NAME_MAX, `Name must be at most ${NAME_MAX} characters`)
    .matches(/^[\p{L}\p{M}' .-]+$/u, 'Use letters, spaces, apostrophes, dots or hyphens only');

export const emailField = () =>
  string()
    .trim()
    .lowercase()
    .required('Email is required')
    .max(254, 'Email is too long')
    .email('Enter a valid email address');

export const passwordField = () =>
  string()
    .required('Password is required')
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
    .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`)
    .matches(/[a-z]/, 'Add a lowercase letter')
    .matches(/[A-Z]/, 'Add an uppercase letter')
    .matches(/\d/, 'Add a number');

export const reasonField = () =>
  cleanText()
    .required('A reason is required')
    .min(REASON_MIN, `Give a reason of at least ${REASON_MIN} characters`)
    .max(REASON_MAX, `Keep the reason under ${REASON_MAX} characters`);

export const objectIdField = (label = 'id') =>
  string()
    .trim()
    .matches(/^[a-f\d]{24}$/i, `Invalid ${label}`);

export const pageField = () => number().integer().min(1).max(10_000).default(1);

export const pageSizeField = () =>
  number()
    .integer()
    .oneOf([...PAGE_SIZES])
    .default(PAGE_SIZES[0]);

export const searchField = () => cleanText().max(80, 'Search is too long').default('');
