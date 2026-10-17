import { Script } from 'node:vm';
import { ERROR_CODES } from '@planpilot/shared';
import { Router } from 'express';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openApiDocument } from '../src/docs/openapi';

// ---------- the real routes, read from the Express 5 router stack ----------

interface LayerLike {
  route?: { path: unknown; methods: Record<string, boolean> };
  handle?: { stack?: LayerLike[] };
  /** Recorded below: Express 5 layers keep a matcher, not the path they were mounted on. */
  mountPath?: string;
}

interface RouterLike {
  stack: LayerLike[];
  use: (...args: unknown[]) => unknown;
}

/**
 * Builds the app while recording the path of every `use()` call on the layers it adds,
 * so nested routers can be resolved to full paths afterwards.
 */
function createAppRecordingMounts(): Express {
  const proto = Object.getPrototypeOf(Object.getPrototypeOf(Router())) as RouterLike;
  const originalUse = proto.use;
  proto.use = function recordingUse(this: RouterLike, ...args: unknown[]) {
    const before = this.stack.length;
    const result = originalUse.apply(this, args);
    const first = args[0];
    const path = typeof first === 'string' ? first : typeof first === 'function' ? '/' : null;
    for (const layer of this.stack.slice(before)) {
      if (path === null) throw new Error('Only string mount paths are supported by this test');
      layer.mountPath = path;
    }
    return result;
  };
  try {
    return createApp();
  } finally {
    proto.use = originalUse;
  }
}

const joinPath = (...parts: string[]) =>
  `/${parts.join('/')}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');

function listRoutes(stack: LayerLike[], prefix = ''): string[] {
  const found: string[] = [];
  for (const layer of stack) {
    if (layer.route) {
      const { path, methods } = layer.route;
      if (typeof path !== 'string') throw new Error(`Unsupported route path: ${String(path)}`);
      for (const method of Object.keys(methods)) {
        found.push(`${method === '_all' ? 'ALL' : method.toUpperCase()} ${joinPath(prefix, path)}`);
      }
    } else if (Array.isArray(layer.handle?.stack)) {
      if (layer.mountPath === undefined) {
        throw new Error(
          `A router under "${prefix || '/'}" was mounted before it could be recorded`,
        );
      }
      found.push(...listRoutes(layer.handle.stack, joinPath(prefix, layer.mountPath)));
    }
  }
  return found;
}

const toOpenApiPath = (path: string) => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

// ---------- the document ----------

const doc = openApiDocument as unknown as {
  servers: { url: string }[];
  info: { description: string };
  tags: { name: string }[];
  paths: Record<string, Record<string, unknown>>;
  components: Record<string, Record<string, unknown>>;
};

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

interface OperationLike {
  operationId?: string;
  tags?: string[];
  security?: Record<string, string[]>[];
  parameters?: unknown[];
  responses?: Record<string, unknown>;
  'x-roles'?: string[];
}

const operations = Object.entries(doc.paths).flatMap(([path, item]) =>
  HTTP_METHODS.filter((method) => method in item).map((method) => ({
    path,
    method,
    key: `${method.toUpperCase()} ${path}`,
    operation: item[method] as OperationLike,
    pathParameters: (item.parameters as unknown[] | undefined) ?? [],
  })),
);

/** Resolves a local JSON pointer such as `#/components/schemas/Plan`. */
function resolvePointer(pointer: string): unknown {
  if (!pointer.startsWith('#/')) return undefined;
  return pointer
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      doc,
    );
}

const deref = <T>(value: unknown): T => {
  const ref = (value as { $ref?: unknown } | null)?.$ref;
  return (typeof ref === 'string' ? resolvePointer(ref) : value) as T;
};

function collectRefs(node: unknown, at = '#', out: { at: string; ref: string }[] = []) {
  if (Array.isArray(node)) node.forEach((child, i) => collectRefs(child, `${at}/${i}`, out));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') out.push({ at, ref: value });
      else collectRefs(value, `${at}/${key}`, out);
    }
  }
  return out;
}

// ---------- tests ----------

describe('OpenAPI document matches the real routes', () => {
  let routes: string[];

  beforeAll(() => {
    const app = createAppRecordingMounts();
    const base = doc.servers[0]?.url ?? '';
    routes = listRoutes((app.router as unknown as RouterLike).stack)
      .filter((route) => route.split(' ')[1]?.startsWith(`${base}/`))
      .map((route) => {
        const [method, path = ''] = route.split(' ');
        return `${method} ${toOpenApiPath(path.slice(base.length))}`;
      });
  });

  it('finds the routes in the Express router stack', () => {
    expect(routes.length).toBeGreaterThan(40);
    expect(routes).toContain('GET /health');
    expect(routes).toContain('PATCH /admin/subscriptions/{id}/extend');
  });

  it('documents every registered route', () => {
    const documented = new Set(operations.map((o) => o.key));
    expect(routes.filter((route) => !documented.has(route))).toEqual([]);
  });

  it('documents no route that does not exist', () => {
    const registered = new Set(routes);
    expect(operations.map((o) => o.key).filter((key) => !registered.has(key))).toEqual([]);
  });

  it('registers each route only once', () => {
    expect(routes.filter((route, i) => routes.indexOf(route) !== i)).toEqual([]);
  });

  it('includes the endpoints the brief asks for, at exactly these paths', () => {
    const keys = operations.map((o) => o.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'POST /auth/register',
        'POST /auth/login',
        'GET /plans',
        'POST /subscribe/{planId}',
        'GET /my-subscription',
        'GET /admin/subscriptions',
      ]),
    );
  });
});

describe('OpenAPI document structure', () => {
  it('is an OpenAPI 3.1 document served from /api', () => {
    expect(openApiDocument.openapi).toBe('3.1.0');
    expect(doc.servers).toEqual([expect.objectContaining({ url: '/api' })]);
  });

  it('resolves every $ref', () => {
    const broken = collectRefs(doc).filter(({ ref }) => resolvePointer(ref) === undefined);
    expect(broken).toEqual([]);
  });

  it('gives every operation a unique operationId, a declared tag and explicit security', () => {
    const ids = operations.map((o) => o.operation.operationId);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);

    const tags = new Set(doc.tags.map((t) => t.name));
    const schemes = new Set(Object.keys(doc.components.securitySchemes ?? {}));
    for (const { key, operation } of operations) {
      expect(operation.tags?.length, key).toBeGreaterThan(0);
      for (const tag of operation.tags ?? [])
        expect(tags.has(tag), `${key}: tag ${tag}`).toBe(true);
      expect(Array.isArray(operation.security), `${key}: security`).toBe(true);
      for (const requirement of operation.security ?? []) {
        for (const name of Object.keys(requirement)) {
          expect(schemes.has(name), `${key}: scheme ${name}`).toBe(true);
        }
      }
    }
  });

  it('gives every operation a 2xx response and at least one error response', () => {
    for (const { key, operation } of operations) {
      const statuses = Object.keys(operation.responses ?? {});
      expect(
        statuses.some((s) => /^2\d\d$/.test(s)),
        `${key} has no 2xx response`,
      ).toBe(true);
      expect(
        statuses.some((s) => /^[45]\d\d$/.test(s)),
        `${key} has no error response`,
      ).toBe(true);
    }
  });

  it('declares every path parameter, and only those, as required', () => {
    for (const { key, path, operation, pathParameters } of operations) {
      const inTemplate = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      const declared = [...pathParameters, ...(operation.parameters ?? [])]
        .map((p) => deref<{ name: string; in: string; required?: boolean }>(p))
        .filter((p) => p.in === 'path');
      expect(declared.map((p) => p.name).sort(), key).toEqual([...inTemplate].sort());
      for (const p of declared) expect(p.required, `${key}: ${p.name}`).toBe(true);
    }
  });

  it('marks who may call each signed-in operation', () => {
    for (const { key, operation } of operations) {
      const bearer = operation.security?.some((r) => 'bearerAuth' in r) ?? false;
      expect(Boolean(operation['x-roles']?.length), key).toBe(bearer);
    }
  });

  it('lists every error code in the overview', () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(doc.info.description, code).toContain(`\`${code}\``);
    }
  });
});

describe('API docs routes', () => {
  const app = createApp();

  it('serves the document as JSON', async () => {
    const res = await request(app).get('/api/openapi.json').expect(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(openApiDocument)));
  });

  it('serves the interactive reference page', async () => {
    await request(app).get('/api/docs').expect(301).expect('Location', '/api/docs/');
    const res = await request(app).get('/api/docs/').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<title>PlanPilot API</title>');
    await request(app).get('/api/docs/swagger-ui.css').expect(200);
  });

  it('points the page at /api/openapi.json with a script that parses', async () => {
    const init = await request(app).get('/api/docs/swagger-ui-init.js').expect(200);
    expect(init.text).toContain('"swaggerUrl": "/api/openapi.json"');
    // Throws on a syntax error, without running the script.
    expect(() => new Script(init.text)).not.toThrow();
  });
});
