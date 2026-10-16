import { array, boolean, number, object } from 'yup';
import type { InferType } from 'yup';
import { cleanText } from './common';

const MAX_PRICE_PAISE = 10_00_000 * 100; // ₹10,00,000

const limitField = (label: string) =>
  number()
    .typeError(`${label} must be a number`)
    .integer(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)
    .max(100_000, `${label} is too large`)
    .nullable()
    .defined();

const planFields = {
  name: cleanText()
    .required('Plan name is required')
    .min(2, 'Plan name is too short')
    .max(40, 'Plan name is too long'),
  description: cleanText().max(160, 'Keep the description under 160 characters').default(''),
  durationDays: number()
    .typeError('Duration must be a number')
    .required('Duration is required')
    .integer('Duration must be whole days')
    .min(1, 'Duration must be at least 1 day')
    .max(3650, 'Duration must be at most 10 years'),
  features: array(
    cleanText()
      .required('Feature cannot be empty')
      .min(2, 'Feature is too short')
      .max(80, 'Feature is too long'),
  )
    .min(1, 'Add at least one feature')
    .max(12, 'Up to 12 features')
    .required(),
  limits: object({
    projects: limitField('Project limit'),
    teamMembers: limitField('Team member limit'),
  }).required(),
  tier: number().typeError('Tier must be a number').required().integer().min(1).max(10),
  isPopular: boolean().default(false),
  isActive: boolean().default(true),
};

/** API body: price in integer paise. */
export const planSchema = object({
  ...planFields,
  price: number()
    .typeError('Price must be a number')
    .required('Price is required')
    .integer('Price must be in whole paise')
    .min(0, 'Price cannot be negative')
    .max(MAX_PRICE_PAISE, 'Price is too high'),
}).noUnknown();

/** Admin form: price typed in rupees, converted to paise on submit. */
export const planFormSchema = object({
  ...planFields,
  priceRupees: number()
    .typeError('Price must be a number')
    .required('Price is required')
    .min(0, 'Price cannot be negative')
    .max(MAX_PRICE_PAISE / 100, 'Price is too high')
    .test(
      'two-decimals',
      'Use at most 2 decimal places',
      (v) => v == null || Math.abs(v * 100 - Math.round(v * 100)) < 1e-6,
    ),
}).noUnknown();

export type PlanInput = InferType<typeof planSchema>;
export type PlanFormValues = InferType<typeof planFormSchema>;
