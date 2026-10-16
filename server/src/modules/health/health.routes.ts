import { Router } from 'express';
import mongoose from 'mongoose';
import { ok } from '../../utils/respond';

export const healthRouter = Router();

/** Plain (never encrypted) so uptime monitors and the keep-warm job can read it. */
healthRouter.get('/health', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.setHeader('Cache-Control', 'no-store');
  ok(
    res,
    {
      status: dbUp ? 'ok' : 'degraded',
      database: dbUp ? 'up' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString(),
    },
    dbUp ? 200 : 503,
  );
});
