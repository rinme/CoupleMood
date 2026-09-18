import express from 'express';
import type { Express } from 'express';
import cookieParser from 'cookie-parser';
import type { Database } from 'better-sqlite3';
import { initDb } from './db.js';
import { authRouter } from './routes/auth.js';
import { moodRouter } from './routes/mood.js';
import { pushRouter } from './routes/push.js';
import { streamRouter } from './routes/stream.js';

/**
 * Creates and configures the Express application.
 */
export function createApp(db?: Database): Express {
  if (db) {
    // If a database instance was provided, ensure it's set as active
    // Note: getDb() uses dbInstance
  }

  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // API Routers
  app.use('/api/auth', authRouter);
  app.use('/api/mood', moodRouter);
  app.use('/api/push', pushRouter);
  app.use('/api/stream', streamRouter);

  return app;
}

export default createApp;
