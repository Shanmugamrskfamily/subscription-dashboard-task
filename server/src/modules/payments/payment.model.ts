import { CHANGE_TYPES, PAYMENT_STATUSES } from '@planpilot/shared';
import { Schema, model } from 'mongoose';
import type { HydratedDocument, InferSchemaType, Types } from 'mongoose';

/**
 * One document per checkout attempt. The amount and the plan-change maths are fixed
 * on the server when the order is created; the browser only reports the outcome.
 */
const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', default: null },
    provider: { type: String, enum: ['razorpay', 'simulated'], required: true },
    // Unique: verifying the same order twice can never activate two plans.
    razorpayOrderId: { type: String, required: true, unique: true },
    razorpayPaymentId: { type: String, default: null },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'created', index: true },
    changeType: { type: String, enum: CHANGE_TYPES, required: true },
    quote: {
      credit: { type: Number, required: true },
      price: { type: Number, required: true },
      bonusDays: { type: Number, required: true },
      durationDays: { type: Number, required: true },
      creditBasis: { type: Number, required: true },
      currentSubscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', default: null },
    },
    failureReason: { type: String, default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentSchema.index({ status: 1, paidAt: -1 });

export type Payment = InferSchemaType<typeof paymentSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
};
export type PaymentDocument = HydratedDocument<Payment>;
export const PaymentModel = model('Payment', paymentSchema);
