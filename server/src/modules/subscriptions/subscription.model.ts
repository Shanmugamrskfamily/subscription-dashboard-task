import { CHANGE_TYPES, SUBSCRIPTION_STATUSES } from '@planpilot/shared';
import { Schema, model } from 'mongoose';
import type { HydratedDocument, InferSchemaType, Types } from 'mongoose';

export const END_REASONS = [
  'expired',
  'cancelled',
  'replaced',
  'admin_expired',
  'admin_cancelled',
] as const;
export type EndReason = (typeof END_REASONS)[number];

const adjustmentSchema = new Schema(
  {
    type: { type: String, enum: ['extend', 'expire', 'assign', 'cancel'], required: true },
    days: { type: Number, default: null },
    newEndDate: { type: Date, default: null },
    reason: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const subscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'active' },

    /** Cash collected for this period, in paise (0 for credit-only or admin changes). */
    amountPaid: { type: Number, default: 0, min: 0 },
    /**
     * Value this period represents (cash + credit applied). Unused value converts to
     * credit on the next plan change. Admin-assigned plans have 0, so they can't be
     * turned into credit.
     */
    creditBasis: { type: Number, default: 0, min: 0 },
    changeType: { type: String, enum: CHANGE_TYPES, required: true },
    previousSubscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', default: null },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },

    endedAt: { type: Date, default: null },
    endReason: { type: String, enum: END_REASONS, default: null },

    remindedExpiringAt: { type: Date, default: null },
    remindedFinalAt: { type: Date, default: null },
    notifiedExpiredAt: { type: Date, default: null },

    adjustments: { type: [adjustmentSchema], default: [] },
  },
  { timestamps: true },
);

// The rule "one active plan per user" lives in the database itself: two simultaneous
// purchases can't both succeed, because the second insert breaks this unique index.
subscriptionSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' }, name: 'one_active_per_user' },
);
subscriptionSchema.index({ status: 1, endDate: 1 });
subscriptionSchema.index({ createdAt: -1 });

export type Subscription = InferSchemaType<typeof subscriptionSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};
export type SubscriptionDocument = HydratedDocument<Subscription>;
export const SubscriptionModel = model('Subscription', subscriptionSchema);
