import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { addConnection } from '../sse.js';

export const streamRouter = Router();

/**
 * GET /api/stream
 * SSE connection endpoint for real-time mood updates.
 */
streamRouter.get('/', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  // Send initial connection acknowledgment comment
  res.write(': connected\n\n');

  const cleanup = addConnection(req.user.id, res);

  req.on('close', cleanup);
});
