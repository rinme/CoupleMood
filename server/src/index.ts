import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Express } from 'express';
import type { Database } from 'better-sqlite3';
import { createApp } from './app.js';
import { initDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves the absolute path to the client/dist directory.
 */
export function getClientDistPath(customPath?: string): string {
  if (customPath) return path.resolve(customPath);
  if (process.env.CLIENT_DIST) return path.resolve(process.env.CLIENT_DIST);

  const cwdDist = path.resolve(process.cwd(), 'client/dist');
  if (fs.existsSync(cwdDist)) {
    return cwdDist;
  }

  const relativeDist = path.resolve(__dirname, '../../client/dist');
  return relativeDist;
}

/**
 * Creates the production Express application with API routes,
 * Service Worker headers, and SPA static hosting.
 */
export function createProductionApp(clientDistPath?: string, db?: Database): Express {
  const app = createApp(db);
  const distPath = getClientDistPath(clientDistPath);

  // 1. Service Worker route with required PWA headers
  app.get('/sw.js', (_req, res, next) => {
    const swDistPath = path.join(distPath, 'sw.js');
    const swPublicPath = path.resolve(distPath, '../public/sw.js');
    const targetPath = fs.existsSync(swDistPath) ? swDistPath : (fs.existsSync(swPublicPath) ? swPublicPath : null);

    if (targetPath) {
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Content-Type', 'application/javascript');
      return res.sendFile(targetPath);
    }
    next();
  });

  // 2. API 404 handler: unhandled /api/* routes return 404 JSON, not SPA fallback
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  // 3. Serve static assets from client/dist if present
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('sw.js')) {
          res.setHeader('Service-Worker-Allowed', '/');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }));

    // 4. SPA Fallback: non-API, non-asset navigation routes serve index.html
    app.get('*', (req, res, next) => {
      // Never serve index.html for API routes, assets, or paths with file extensions
      if (
        req.path.startsWith('/api/') ||
        req.path.startsWith('/assets/') ||
        path.extname(req.path) !== ''
      ) {
        return res.status(404).send('Not Found');
      }
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.sendFile(indexPath);
      }
      next();
    });
  }

  return app;
}

/**
 * Initializes database and starts HTTP server on the specified port.
 */
export function startServer(port: number = Number(process.env.PORT) || 3000, clientDistPath?: string) {
  initDb();
  const app = createProductionApp(clientDistPath);
  const server = app.listen(port, () => {
    console.log(`CoupleMood server listening on port ${port}`);
  });
  return { app, server };
}

// Auto-start server if executed directly as script entrypoint
const isDirectRun = Boolean(
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
);

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  startServer();
}

export default createProductionApp;
