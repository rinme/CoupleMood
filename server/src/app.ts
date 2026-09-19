import express from 'express';
import type { Express } from 'express';
import cookieParser from 'cookie-parser';
import { setDb } from './db.js';
import { authRouter } from './routes/auth.js';
import { deviceLinkRouter } from './routes/device-link.js';
import { moodRouter } from './routes/mood.js';
import { pushRouter } from './routes/push.js';
import { streamRouter } from './routes/stream.js';
import { presetsRouter } from './routes/presets.js';
import { adminRouter } from './routes/admin.js';

/**
 * Creates and configures the Express application.
 */
export function createApp(db?: any): Express {
  if (db) {
    setDb(db);
  }

  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // API Routers
  app.use('/api/auth/device-link', deviceLinkRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/mood', moodRouter);
  app.use('/api/presets', presetsRouter);
  app.use('/api/push', pushRouter);
  app.use('/api/stream', streamRouter);
  app.use('/api/admin', adminRouter);

  return app;
}

export const app = createApp();
export default app;
