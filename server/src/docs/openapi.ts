import type { OpenAPIV3_1 } from 'openapi-types';

/** Filled out in full in the API docs commit. */
export const openApiDocument: OpenAPIV3_1.Document = {
  openapi: '3.1.0',
  info: {
    title: 'PlanPilot API',
    version: '1.0.0',
    description: 'Subscription management API.',
  },
  servers: [{ url: '/api' }],
  paths: {},
};
