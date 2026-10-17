import { headers, parameters, securitySchemes } from './components';
import { description } from './description';
import { errorExamples, sharedErrorResponses } from './errors';
import type { BuiltOperation } from './operation';
import { meOperations, notificationOperations } from './paths/account';
import {
  adminActivityOperations,
  adminPlanOperations,
  adminStatsOperations,
  adminSubscriptionOperations,
  adminUserOperations,
  demoOperations,
} from './paths/admin';
import { authOperations } from './paths/auth';
import { paymentOperations, planOperations, subscriptionOperations } from './paths/billing';
import { systemOperations } from './paths/system';
import { workspaceOperations } from './paths/workspace';
import type { Document, Operation } from './refs';
import { schemas } from './schemas';

const operations: BuiltOperation[] = [
  ...systemOperations,
  ...authOperations,
  ...planOperations,
  ...subscriptionOperations,
  ...paymentOperations,
  ...workspaceOperations,
  ...meOperations,
  ...notificationOperations,
  ...adminStatsOperations,
  ...adminSubscriptionOperations,
  ...adminUserOperations,
  ...adminPlanOperations,
  ...adminActivityOperations,
  ...demoOperations,
];

function toPaths(list: BuiltOperation[]): Document['paths'] {
  const paths: Record<string, Partial<Record<BuiltOperation['method'], Operation>>> = {};
  for (const { path, method, operation } of list) {
    const item = (paths[path] ??= {});
    if (item[method]) throw new Error(`Duplicate operation ${method.toUpperCase()} ${path}`);
    item[method] = operation;
  }
  // openapi-types 12 intersects the 3.1 path item with the 3.0 one, so a valid 3.1
  // operation (3.1 schemas) never satisfies its type; the operations themselves are typed.
  return paths as Document['paths'];
}

/** The PlanPilot OpenAPI 3.1 document, served at /api/openapi.json and rendered at /api/docs. */
export const openApiDocument: Document = {
  openapi: '3.1.0',
  info: {
    title: 'PlanPilot API',
    version: '1.0.0',
    summary: 'Subscription management API: plans, prorated plan changes, payments and admin.',
    description,
    license: { name: 'MIT', identifier: 'MIT' },
  },
  servers: [{ url: '/api', description: 'This server' }],
  tags: [
    {
      name: 'Health',
      description:
        'Health check and this API description. Plain JSON, never encrypted or rate limited.',
    },
    { name: 'Auth', description: 'Sign-up, sign-in, token refresh and sign-out.' },
    { name: 'Plans', description: 'The public plan catalogue.' },
    {
      name: 'Subscriptions',
      description:
        'The signed-in customer’s plan: view it, price a change, subscribe or switch with proration, cancel.',
    },
    { name: 'Payments', description: 'Completing or abandoning a Razorpay checkout (test mode).' },
    {
      name: 'Workspace',
      description:
        'Projects and team members, capped by the active plan’s limits. Read-only without an active plan.',
    },
    {
      name: 'Me',
      description: 'Profile, password, signed-in devices, billing history and usage.',
    },
    { name: 'Notifications', description: 'In-app notifications.' },
    { name: 'Admin – Stats', description: 'Revenue and usage analytics. Administrators only.' },
    {
      name: 'Admin – Subscriptions',
      description: 'Every subscription: list, export, extend and end. Administrators only.',
    },
    {
      name: 'Admin – Users',
      description:
        'User management: status, role, plan assignment and forced sign-out. Administrators only.',
    },
    { name: 'Admin – Plans', description: 'Plan catalogue management. Administrators only.' },
    { name: 'Admin – Activity', description: 'The audit log. Administrators only.' },
    { name: 'Demo', description: 'Demo data tools, only when the server runs in demo mode.' },
  ],
  paths: toPaths(operations),
  components: {
    schemas,
    parameters,
    headers,
    responses: sharedErrorResponses,
    examples: errorExamples,
    securitySchemes,
  },
};
