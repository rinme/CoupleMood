import type { Response } from 'express';

const connections = new Map<string, Set<Response>>();
const pingIntervals = new Map<Response, NodeJS.Timeout>();

const PING_INTERVAL_MS = 25000;

/**
 * Registers an active SSE client response for a given user.
 * Starts a 25s ping keepalive and returns a cleanup function.
 */
export function addConnection(userId: string, res: Response): () => void {
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }

  const userConnections = connections.get(userId)!;
  userConnections.add(res);

  // Periodic heartbeat every 25 seconds
  const interval = setInterval(() => {
    try {
      if (!res.destroyed && !res.writableEnded) {
        res.write(': ping\n\n');
      } else {
        cleanup();
      }
    } catch {
      cleanup();
    }
  }, PING_INTERVAL_MS);

  pingIntervals.set(res, interval);

  const cleanup = () => {
    const timer = pingIntervals.get(res);
    if (timer) {
      clearInterval(timer);
      pingIntervals.delete(res);
    }

    const currentConns = connections.get(userId);
    if (currentConns) {
      currentConns.delete(res);
      if (currentConns.size === 0) {
        connections.delete(userId);
      }
    }
  };

  res.on('close', cleanup);

  return cleanup;
}

/**
 * Broadcasts an SSE event to all connected sessions of the partner user.
 */
export function notifyPartner(partnerUserId: string, eventData: Record<string, unknown>): void {
  const userConnections = connections.get(partnerUserId);
  if (!userConnections || userConnections.size === 0) {
    return;
  }

  const eventType = typeof eventData.type === 'string' ? eventData.type : 'mood_update';
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(eventData)}\n\n`;

  for (const client of userConnections) {
    try {
      if (!client.destroyed && !client.writableEnded) {
        client.write(payload);
      }
    } catch {
      // Errors handled on stream close
    }
  }
}

/**
 * Closes all active SSE connections and clears keepalive timers.
 */
export function closeAllConnections(): void {
  for (const [res, timer] of pingIntervals.entries()) {
    clearInterval(timer);
    try {
      res.end();
    } catch {
      // Ignore
    }
  }
  pingIntervals.clear();
  connections.clear();
}

/**
 * Returns the current active connection count for a user or total connections.
 */
export function getConnectionCount(userId?: string): number {
  if (userId) {
    return connections.get(userId)?.size ?? 0;
  }
  let total = 0;
  for (const set of connections.values()) {
    total += set.size;
  }
  return total;
}
