import { NAME_MAX, ROLES, USER_STATUSES } from '@planpilot/shared';
import type { Role, UserStatus } from '@planpilot/shared';
import { Schema, model } from 'mongoose';
import type { HydratedDocument, InferSchemaType, Types } from 'mongoose';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: NAME_MAX },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'user' as Role, index: true },

    status: { type: String, enum: USER_STATUSES, default: 'active' as UserStatus, index: true },
    statusReason: { type: String, default: null },
    statusChangedAt: { type: Date, default: null },
    statusChangedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** After this moment the account can no longer sign in (set by an admin). */
    accessExpiresAt: { type: Date, default: null },

    /** Counters kept in step with the user's projects and team members (see workspace). */
    usage: {
      projects: { type: Number, default: 0, min: 0 },
      teamMembers: { type: Number, default: 0, min: 0 },
    },

    lastSeenAt: { type: Date, default: null, index: true },
    failedLogins: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ createdAt: -1 });

export type User = InferSchemaType<typeof userSchema> & { _id: Types.ObjectId };
export type UserDocument = HydratedDocument<User>;
export const UserModel = model('User', userSchema);
