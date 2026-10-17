import { Schema, model } from 'mongoose';
import type { InferSchemaType, Types } from 'mongoose';

/**
 * One document per refresh token. Every refresh rotates the token: the old document
 * is marked revoked and points at its replacement, and both share a `familyId`
 * (one family = one signed-in device). If a revoked token is ever presented again
 * after the grace window, someone kept an old copy, so the whole family is revoked.
 */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String, default: 'Unknown device', maxlength: 300 },
    lastUsedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    replacedByHash: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// MongoDB removes expired sessions on its own.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type Session = InferSchemaType<typeof sessionSchema> & { _id: Types.ObjectId };
export const SessionModel = model('Session', sessionSchema);
