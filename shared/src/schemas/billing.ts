import { object, string } from 'yup';
import type { InferType } from 'yup';
import { cleanText, objectIdField } from './common';

export const planIdParamsSchema = object({
  planId: objectIdField('plan id').required('Plan id is required'),
}).noUnknown();

/** The three values Razorpay Checkout hands back on success. */
export const verifyPaymentSchema = object({
  razorpay_order_id: string()
    .trim()
    .required()
    .matches(/^order_[A-Za-z0-9]{6,40}$/, 'Invalid order id'),
  razorpay_payment_id: string()
    .trim()
    .required()
    .matches(/^pay_[A-Za-z0-9]{6,40}$/, 'Invalid payment id'),
  razorpay_signature: string()
    .trim()
    .required()
    .matches(/^[a-f0-9]{64}$/, 'Invalid signature'),
}).noUnknown();

export const paymentFailedSchema = object({
  reason: cleanText().max(200).default('Payment was not completed'),
}).noUnknown();

export type VerifyPaymentInput = InferType<typeof verifyPaymentSchema>;
