import { Router } from 'express';
import { getVapidKeys, savePushSubscription, deletePushSubscription } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const pushRouter = Router();

/**
 * GET /api/push/key
 * Returns the public VAPID key for browser subscription.
 */
pushRouter.get('/key', (_req, res) => {
  const keys = getVapidKeys();
  res.status(200).json({ publicKey: keys.publicKey });
});

/**
 * POST /api/push/subscribe
 * Registers or updates a push subscription for the authenticated user.
 */
pushRouter.post('/subscribe', requireAuth, (req, res) => {
  const { endpoint, keys } = req.body ?? {};

  if (!endpoint || typeof endpoint !== 'string') {
    res.status(400).json({ error: 'Endpoint is required' });
    return;
  }

  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    res.status(400).json({ error: 'Subscription keys (p256dh, auth) are required' });
    return;
  }

  try {
    savePushSubscription(req.user.id, endpoint, keys.p256dh, keys.auth);
    res.status(200).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save push subscription' });
  }
});

/**
 * POST /api/push/unsubscribe
 * Removes a push subscription for the authenticated user.
 */
pushRouter.post('/unsubscribe', requireAuth, (req, res) => {
  const { endpoint } = req.body ?? {};

  if (!endpoint || typeof endpoint !== 'string') {
    res.status(400).json({ error: 'Endpoint is required' });
    return;
  }

  try {
    deletePushSubscription(endpoint, req.user.id);
    res.status(200).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to remove push subscription' });
  }
});
