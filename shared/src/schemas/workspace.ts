import { object, string } from 'yup';
import type { InferType } from 'yup';
import { TEAM_ROLES } from '../constants';
import { cleanText, emailField, nameField } from './common';

export const PROJECT_COLORS = ['indigo', 'violet', 'sky', 'emerald', 'amber', 'rose'] as const;

export const projectSchema = object({
  name: cleanText()
    .required('Project name is required')
    .min(2, 'Project name is too short')
    .max(60, 'Project name is too long'),
  description: cleanText().max(200, 'Keep the description under 200 characters').default(''),
  color: string()
    .oneOf([...PROJECT_COLORS], 'Pick a colour')
    .default('indigo'),
}).noUnknown();

export const teamMemberSchema = object({
  name: nameField(),
  email: emailField(),
  role: string()
    .oneOf([...TEAM_ROLES], 'Pick a role')
    .default('viewer'),
}).noUnknown();

export type ProjectInput = InferType<typeof projectSchema>;
export type TeamMemberInput = InferType<typeof teamMemberSchema>;
