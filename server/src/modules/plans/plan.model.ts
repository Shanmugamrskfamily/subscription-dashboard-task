import { Schema, model } from 'mongoose';
import type { HydratedDocument, InferSchemaType, Types } from 'mongoose';

const limit = { type: Number, default: null, min: 0 };

const planSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    /** Integer paise: ₹799 is stored as 79900, so money never touches floating point. */
    price: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'Price must be whole paise' },
    },
    currency: { type: String, enum: ['INR'], default: 'INR' },
    durationDays: { type: Number, required: true, min: 1 },
    features: { type: [String], default: [] },
    /** `null` means unlimited. */
    limits: { projects: limit, teamMembers: limit },
    /** Plan order for upgrade/downgrade decisions: higher tier = more capable plan. */
    tier: { type: Number, required: true, min: 1 },
    isPopular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export type Plan = InferSchemaType<typeof planSchema> & { _id: Types.ObjectId };
export type PlanDocument = HydratedDocument<Plan>;
export const PlanModel = model('Plan', planSchema);
