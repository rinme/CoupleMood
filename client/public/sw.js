// Mood Sender Service Worker
// Handles caching, Web Push notifications, and notification click navigation

const CACHE_NAME = 'mood-sender-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/badge.png',
];

// Pre-cache core app shell on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Clean up old caches on activation and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch event: Network-first for API requests, cache-first for static shell
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  let pathname = request.url;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    const match = request.url.match(/^[a-z]+:\/\/[^/]+(\/.*)$/i);
    pathname = match ? match[1] : request.url;
  }

  // SSE Stream should bypass SW cache and go directly to network
  if (pathname === '/api/stream') {
    return;
  }

  // Network-first for API requests
  if (pathname.startsWith('/api/')) {
    event.respondWith(
      Promise.resolve()
        .then(() => fetch(request))
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, responseClone))
              .catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            return cached;
          }
          throw new Error('Network unavailable and no cached API response');
        })
    );
    return;
  }

  // Cache-first for static assets and shell
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return Promise.resolve()
        .then(() => fetch(request))
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic'
          ) {
            const responseClone = networkResponse.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, responseClone))
              .catch(() => {});
          }
          return networkResponse;
        })
        .catch(async (err) => {
          // If navigation fails, fall back to cached root app shell
          if (request.mode === 'navigate') {
            const shell = await caches.match('/');
            if (shell) return shell;
          }
          throw err;
        });
    })
  );
});

// Push notification received
self.addEventListener('push', (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'Mood Sender';
  const targetUrl = (payload.data && payload.data.url) || payload.url || '/';
  const options = {
    body: payload.body || 'Your partner shared a mood update.',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/badge.png',
    tag: 'couple-mood',
    renotify: true,
    data: { ...(payload.data || {}), url: targetUrl },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification clicked: focus existing client or open new window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl =
    (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          let clientPath = client.url;
          try {
            clientPath = new URL(client.url).pathname;
          } catch {
            const match = client.url.match(/^[a-z]+:\/\/[^/]+(\/.*)$/i);
            clientPath = match ? match[1] : client.url;
          }

          // Match root or target URL
          if (
            clientPath === '/' ||
            client.url === targetUrl ||
            client.url.endsWith(targetUrl)
          ) {
            if (client.postMessage) {
              client.postMessage({ type: 'REFRESH_MOOD' });
            }
            if (client.focus) {
              return client.focus();
            }
            return;
          }
        }

        // No matching client found, open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
