import pino from 'pino';
import { getConfig } from '../config/env';

const config = getConfig();

export const logger = pino({
  level: config.logLevel,
  base: { service: 'planpilot-api' },
  // Never write credentials, tokens or cookies to the logs.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.accessToken',
      '*.refreshToken',
      '*.razorpay_signature',
    ],
    censor: '[redacted]',
  },
  ...(config.isProd || config.isTest
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        },
      }),
});
