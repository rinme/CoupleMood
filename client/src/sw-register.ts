import { api } from './api.js';

/**
 * Converts a base64 or URL-safe base64 string to a Uint8Array.
 * Used for converting VAPID public keys for pushManager.subscribe().
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Fallback for Node/Bun testing environments
  const buf = Buffer.from(base64, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * Checks if Service Workers, PushManager, and Notifications are supported.
 */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Registers the Service Worker at /sw.js.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    return registration;
  } catch (err) {
    console.error('Service Worker registration failed:', err);
    return null;
  }
}

/**
 * Retrieves the current push subscription from the registration.
 */
export async function getPushSubscription(
  registration?: ServiceWorkerRegistration | null
): Promise<PushSubscription | null> {
  const reg = registration ?? (await navigator?.serviceWorker?.ready);
  if (!reg || !reg.pushManager) return null;
  return reg.pushManager.getSubscription();
}

/**
 * Requests push permission, fetches public VAPID key, subscribes via pushManager,
 * and saves subscription to backend.
 */
export async function subscribeToPush(
  registration?: ServiceWorkerRegistration | null
): Promise<PushSubscription | null> {
  if (!isPushSupported() && typeof (globalThis as any).Notification === 'undefined') {
    return null;
  }

  const reg = registration ?? (await navigator?.serviceWorker?.ready);
  if (!reg || !reg.pushManager) {
    throw new Error('Service Worker is not ready or does not support PushManager');
  }

  // Request notification permission if needed
  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return null;
    }
  }

  // Fetch VAPID public key
  const { publicKey } = await api.push.getPublicKey();
  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey as any,
  });

  const subJson = subscription.toJSON();
  if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
    await api.push.subscribe({
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      },
    });
  }

  return subscription;
}

/**
 * Unsubscribes from push notifications on device and removes from backend.
 */
export async function unsubscribeFromPush(
  registration?: ServiceWorkerRegistration | null
): Promise<boolean> {
  const reg = registration ?? (await navigator?.serviceWorker?.ready);
  if (!reg || !reg.pushManager) return false;

  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return true;

  const endpoint = subscription.endpoint;
  const successful = await subscription.unsubscribe();

  if (successful && endpoint) {
    try {
      await api.push.unsubscribe(endpoint);
    } catch (err) {
      console.error('Failed to notify server of push unsubscription:', err);
    }
  }

  return successful;
}
