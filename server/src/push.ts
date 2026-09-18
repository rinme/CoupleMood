import webpush from 'web-push';
import { getVapidKeys, getPushSubscriptions, deletePushSubscription } from './db.js';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  data?: Record<string, unknown>;
}

let configuredPublicKey: string | null = null;
let configuredPrivateKey: string | null = null;

/**
 * Ensures web-push is configured with the latest VAPID details from DB/env.
 */
export function ensureVapidConfig(): void {
  const keys = getVapidKeys();
  if (keys.publicKey !== configuredPublicKey || keys.privateKey !== configuredPrivateKey) {
    const subject = process.env.VAPID_SUBJECT || 'mailto:couplemood@example.com';
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
    configuredPublicKey = keys.publicKey;
    configuredPrivateKey = keys.privateKey;
  }
}

/**
 * Sends a Web Push notification to all active subscriptions of a user.
 * Automatically deletes subscriptions that return HTTP 410 (Gone) or 404 (Not Found).
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number }> {
  if (!userId) {
    return { sent: 0, failed: 0 };
  }

  ensureVapidConfig();

  const subscriptions = getPushSubscriptions(userId);
  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const serializedPayload = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          },
          serializedPayload
        );
        sent++;
      } catch (err: any) {
        failed++;
        // Prune expired or invalid subscriptions
        if (err && (err.statusCode === 410 || err.statusCode === 404)) {
          deletePushSubscription(sub.endpoint);
        }
      }
    })
  );

  return { sent, failed };
}
