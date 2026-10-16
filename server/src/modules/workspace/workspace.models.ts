import { TEAM_ROLES } from '@planpilot/shared';
import { PROJECT_COLORS } from '@planpilot/shared';
import { Schema, model } from 'mongoose';
import type { InferSchemaType, Types } from 'mongoose';

const projectSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: '', maxlength: 200 },
    color: { type: String, enum: PROJECT_COLORS, default: 'indigo' },
  },
  { timestamps: true },
);
projectSchema.index({ ownerId: 1, createdAt: -1 });

const teamMemberSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: TEAM_ROLES, default: 'viewer' },
  },
  { timestamps: true },
);
teamMemberSchema.index({ ownerId: 1, email: 1 }, { unique: true });

export type Project = InferSchemaType<typeof projectSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
};
export type TeamMember = InferSchemaType<typeof teamMemberSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
};
export const ProjectModel = model('Project', projectSchema);
export const TeamMemberModel = model('TeamMember', teamMemberSchema);
