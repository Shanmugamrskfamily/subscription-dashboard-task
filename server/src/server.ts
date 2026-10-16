import './config/bootstrap';
import { ConfigError, getConfig } from './config/env';
import type { AppConfig } from './config/env';

let config: AppConfig;
try {
  config = getConfig();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`\nInvalid server configuration:\n  - ${error.problems.join('\n  - ')}\n`);
    process.exit(1);
  }
  throw error;
}

const { createApp } = await import('./app');
const { connectDatabase } = await import('./config/db');
const { startLifecycleJobs } = await import('./jobs/subscription-lifecycle');
const { ensureSeedData } = await import('./seed/seed');
const { logger } = await import('./utils/logger');

const closeDatabase = await connectDatabase(config);
if (config.seedOnBoot) await ensureSeedData();
const stopJobs = startLifecycleJobs();

const server = createApp({ config }).listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      env: config.nodeEnv,
      payments: config.payments.mode,
      encryption: config.payload.enabled,
    },
    `PlanPilot API listening on http://localhost:${config.port}/api`,
  );
});

let shuttingDown = false;
async function shutdown(signal: string, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  stopJobs();
  server.close();
  await closeDatabase().catch(() => undefined);
  process.exit(code);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});
