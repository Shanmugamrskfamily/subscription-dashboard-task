import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Express } from 'express';
import { pinoHttp } from 'pino-http';
import { getConfig } from './config/env';
import type { AppConfig } from './config/env';
import { docsRouter } from './docs/docs.routes';
import { encryptedPayloads } from './middlewares/encryption';
import { errorHandler, notFound } from './middlewares/error-handler';
import { createLimiters } from './middlewares/rate-limit';
import { rejectUnsafeKeys } from './middlewares/sanitize';
import { corsPolicy, securityHeaders } from './middlewares/security';
import { healthRouter } from './modules/health/health.routes';
import { createApiRouter } from './routes';
import { logger } from './utils/logger';

export interface AppOptions {
  config?: AppConfig;
  rateLimits?: boolean;
}

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

export function createApp(options: AppOptions = {}): Express {
  const config = options.config ?? getConfig();
  const limiters = createLimiters(options.rateLimits ?? !config.isTest);
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  // No nested objects from the query string (blocks ?email[$ne]= style injection).
  app.set('query parser', 'simple');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );
  app.use(securityHeaders());
  app.use(corsPolicy(config));
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '16kb' }));

  // Plain endpoints: health check and API docs.
  app.use('/api', healthRouter);
  app.use('/api', docsRouter);

  app.use('/api', limiters.api);
  if (config.payload.enabled) {
    app.use(
      '/api',
      encryptedPayloads({
        privateKey: config.payload.privateKey,
        publicKey: config.payload.publicKey,
        kid: config.payload.kid,
        required: config.payload.required,
      }),
    );
  }
  app.use('/api', rejectUnsafeKeys);
  app.use('/api', createApiRouter(config, limiters));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
