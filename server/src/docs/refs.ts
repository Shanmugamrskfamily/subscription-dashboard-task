import type { Role } from '@planpilot/shared';
import type { OpenAPIV3_1 } from 'openapi-types';

/** Vendor extensions used on operations. */
export interface OperationExtensions {
  /** Roles allowed to call the operation. Absent means no sign-in is needed. */
  'x-roles'?: Role[];
}

export type Document = OpenAPIV3_1.Document<OperationExtensions>;
export type Operation = OpenAPIV3_1.OperationObject<OperationExtensions>;
export type Ref = OpenAPIV3_1.ReferenceObject;
export type Schema = OpenAPIV3_1.SchemaObject | Ref;
export type SchemaObject = OpenAPIV3_1.SchemaObject;
export type Parameter = OpenAPIV3_1.ParameterObject | Ref;
export type Header = OpenAPIV3_1.HeaderObject | Ref;
export type Response = OpenAPIV3_1.ResponseObject | Ref;
export type Example = OpenAPIV3_1.ExampleObject;

const to =
  (section: string) =>
  (name: string): Ref => ({ $ref: `#/components/${section}/${name}` });

export const schemaRef = to('schemas');
export const parameterRef = to('parameters');
export const responseRef = to('responses');
export const headerRef = to('headers');
export const exampleRef = to('examples');

/** A schema that also accepts `null` (JSON Schema 2020-12 style, as OpenAPI 3.1 uses). */
export const nullable = (schema: Schema, description?: string): SchemaObject => ({
  ...(description ? { description } : {}),
  oneOf: [schema, { type: 'null' }],
});

/** Wraps `data` (and optional page meta) in the `{ success: true, data, meta }` envelope. */
export function envelope(data: Schema, paged = false): SchemaObject {
  return {
    type: 'object',
    required: paged ? ['success', 'data', 'meta'] : ['success', 'data'],
    properties: {
      success: { const: true },
      data,
      ...(paged ? { meta: schemaRef('PageMeta') } : {}),
    },
  };
}

/** `{ <name>: true }`, the shape of simple acknowledgements such as `{ deleted: true }`. */
export const flagResult = (name: string, description: string): SchemaObject => ({
  type: 'object',
  required: [name],
  properties: { [name]: { const: true, description } },
});

/** `{ <name>: <count> }`, e.g. `{ revoked: 3 }`. */
export const countResult = (name: string, description: string): SchemaObject => ({
  type: 'object',
  required: [name],
  properties: { [name]: { type: 'integer', minimum: 0, description } },
});
