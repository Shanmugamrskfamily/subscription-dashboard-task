import { PUBLIC, defineOperation } from '../operation';
import { schemaRef } from '../refs';

export const systemOperations = [
  defineOperation({
    method: 'get',
    path: '/health',
    operationId: 'getHealth',
    tag: 'Health',
    summary: 'Health check',
    description:
      'Process and database status for uptime monitors and the keep-warm job. Sent with `Cache-Control: no-store`.',
    access: PUBLIC,
    plain: true,
    success: [
      {
        status: 200,
        description: 'The API and the database are up.',
        data: schemaRef('Health'),
        example: {
          status: 'ok',
          database: 'up',
          uptimeSeconds: 86_412,
          time: '2026-10-17T09:30:00.000Z',
        },
      },
      {
        status: 503,
        description:
          'The API is up but the database is unreachable. Still the success envelope, with `status: "degraded"`.',
        data: schemaRef('Health'),
        example: {
          status: 'degraded',
          database: 'down',
          uptimeSeconds: 12,
          time: '2026-10-17T09:30:00.000Z',
        },
      },
    ],
  }),

  defineOperation({
    method: 'get',
    path: '/openapi.json',
    operationId: 'getOpenApiDocument',
    tag: 'Health',
    summary: 'This OpenAPI document',
    description:
      'The OpenAPI 3.1 document behind this page, as raw JSON (not wrapped in the envelope). The interactive reference is served at `/api/docs`.',
    access: PUBLIC,
    plain: true,
    success: {
      description: 'The OpenAPI document.',
      body: {
        type: 'object',
        description: 'An OpenAPI 3.1 document.',
        required: ['openapi', 'info', 'paths'],
        properties: {
          openapi: { type: 'string', examples: ['3.1.0'] },
          info: { type: 'object' },
          paths: { type: 'object' },
        },
      },
    },
  }),
];
