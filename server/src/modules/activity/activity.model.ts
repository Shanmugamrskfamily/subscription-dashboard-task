import { Schema, model } from 'mongoose';
import type { InferSchemaType, Types } from 'mongoose';

/** Audit trail for the admin activity feed. Entries expire after 30 days. */
const activitySchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    target: {
      type: { type: String },
      id: { type: String },
      label: { type: String },
    },
    meta: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
activitySchema.index({ 'target.id': 1, createdAt: -1 });

export type Activity = InferSchemaType<typeof activitySchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
};
export const ActivityModel = model('Activity', activitySchema);
