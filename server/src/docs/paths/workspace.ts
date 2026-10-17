import { ERROR_CODES as C } from '@planpilot/shared';
import * as ex from '../examples';
import { CUSTOMER, defineOperation } from '../operation';
import { flagResult, parameterRef, schemaRef } from '../refs';

const READ_ONLY_NOTE = 'No active plan: the workspace is read-only.';

export const workspaceOperations = [
  defineOperation({
    method: 'get',
    path: '/projects',
    operationId: 'listProjects',
    tag: 'Workspace',
    summary: 'List my projects',
    description: 'Newest first. Works without a plan (read-only).',
    access: CUSTOMER,
    success: {
      description: 'Projects.',
      data: { type: 'array', items: schemaRef('Project') },
      example: [ex.project],
    },
  }),

  defineOperation({
    method: 'post',
    path: '/projects',
    operationId: 'createProject',
    tag: 'Workspace',
    summary: 'Create a project',
    description:
      'Takes one project slot of the active plan. The slot is reserved with a single atomic update, so two requests racing for the last slot cannot both succeed. Reaching the limit also sends a `limit_reached` notification.',
    access: CUSTOMER,
    body: {
      schema: schemaRef('ProjectInput'),
      example: {
        name: 'Website relaunch',
        description: 'New marketing site and pricing page for Q4.',
        color: 'violet',
      },
    },
    success: {
      status: 201,
      description: 'Created.',
      data: schemaRef('Project'),
      example: ex.project,
    },
    errors: [[C.READ_ONLY, READ_ONLY_NOTE], C.PLAN_LIMIT_REACHED],
  }),

  defineOperation({
    method: 'patch',
    path: '/projects/{id}',
    operationId: 'updateProject',
    tag: 'Workspace',
    summary: 'Update a project',
    description:
      'Replaces the project’s fields: send the full project, because omitted optional fields fall back to their defaults.',
    access: CUSTOMER,
    parameters: [parameterRef('ProjectId')],
    body: {
      schema: schemaRef('ProjectInput'),
      example: { name: 'Website relaunch', description: 'Launch moved to November.', color: 'sky' },
    },
    success: {
      description: 'Updated.',
      data: schemaRef('Project'),
      example: { ...ex.project, description: 'Launch moved to November.', color: 'sky' },
    },
    errors: [
      [C.READ_ONLY, READ_ONLY_NOTE],
      [C.NOT_FOUND, 'No project with this id is yours.'],
    ],
  }),

  defineOperation({
    method: 'delete',
    path: '/projects/{id}',
    operationId: 'deleteProject',
    tag: 'Workspace',
    summary: 'Delete a project',
    description:
      'Frees a project slot. Allowed without a plan too, so a customer can get back under a lower limit.',
    access: CUSTOMER,
    parameters: [parameterRef('ProjectId')],
    success: {
      description: 'Deleted.',
      data: flagResult('deleted', 'Always true.'),
      example: { deleted: true },
    },
    errors: [[C.NOT_FOUND, 'No project with this id is yours.']],
  }),

  defineOperation({
    method: 'get',
    path: '/team',
    operationId: 'listTeamMembers',
    tag: 'Workspace',
    summary: 'List my team',
    description: 'Newest first. Works without a plan (read-only).',
    access: CUSTOMER,
    success: {
      description: 'Team members.',
      data: { type: 'array', items: schemaRef('TeamMember') },
      example: [ex.teamMember],
    },
  }),

  defineOperation({
    method: 'post',
    path: '/team',
    operationId: 'addTeamMember',
    tag: 'Workspace',
    summary: 'Add a team member',
    description:
      'Takes one team seat of the active plan, reserved atomically like projects. Emails are unique per team.',
    access: CUSTOMER,
    body: {
      schema: schemaRef('TeamMemberInput'),
      example: { name: 'Rahul Verma', email: 'rahul.verma@example.com', role: 'editor' },
    },
    success: {
      status: 201,
      description: 'Added.',
      data: schemaRef('TeamMember'),
      example: ex.teamMember,
    },
    errors: [
      [C.READ_ONLY, READ_ONLY_NOTE],
      C.PLAN_LIMIT_REACHED,
      [C.CONFLICT, 'This email is already on the team.'],
    ],
  }),

  defineOperation({
    method: 'delete',
    path: '/team/{id}',
    operationId: 'removeTeamMember',
    tag: 'Workspace',
    summary: 'Remove a team member',
    description: 'Frees a team seat. Allowed without a plan too.',
    access: CUSTOMER,
    parameters: [parameterRef('TeamMemberId')],
    success: {
      description: 'Removed.',
      data: flagResult('deleted', 'Always true.'),
      example: { deleted: true },
    },
    errors: [[C.NOT_FOUND, 'No team member with this id is yours.']],
  }),
];
