import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const CLIENT_DIR = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(CLIENT_DIR, 'public', 'manifest.json');
const SW_PATH = path.join(CLIENT_DIR, 'public', 'sw.js');
const ICONS_DIR = path.join(CLIENT_DIR, 'public', 'icons');

// Helper to check PNG header: 89 50 4E 47 0D 0A 1A 0A
function isPng(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

// Helper to extract PNG width and height from IHDR chunk
function getPngDimensions(buffer: Buffer): { width: number; height: number } {
  if (!isPng(buffer) || buffer.length < 24) {
    throw new Error('Invalid PNG buffer');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

describe('Web App Manifest (client/public/manifest.json)', () => {
  it('exists and is valid JSON', () => {
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);
    const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('contains required PWA properties and cozy warm theme', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    expect(manifest.name).toBe('Mood Sender');
    expect(manifest.short_name).toBe('MoodSender');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color.toLowerCase()).toBe('#faf7f2');
    expect(manifest.background_color.toLowerCase()).toBe('#faf7f2');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });
});

describe('PWA Icon Assets (client/public/icons/)', () => {
  it('contains valid PNG icons with proper dimensions', () => {
    const icon192Path = path.join(ICONS_DIR, 'icon-192.png');
    const icon512Path = path.join(ICONS_DIR, 'icon-512.png');
    const badgePath = path.join(ICONS_DIR, 'badge.png');

    expect(fs.existsSync(icon192Path)).toBe(true);
    expect(fs.existsSync(icon512Path)).toBe(true);
    expect(fs.existsSync(badgePath)).toBe(true);

    const buf192 = fs.readFileSync(icon192Path);
    const buf512 = fs.readFileSync(icon512Path);
    const bufBadge = fs.readFileSync(badgePath);

    expect(isPng(buf192)).toBe(true);
    expect(isPng(buf512)).toBe(true);
    expect(isPng(bufBadge)).toBe(true);

    const dim192 = getPngDimensions(buf192);
    expect(dim192.width).toBe(192);
    expect(dim192.height).toBe(192);

    const dim512 = getPngDimensions(buf512);
    expect(dim512.width).toBe(512);
    expect(dim512.height).toBe(512);

    const dimBadge = getPngDimensions(bufBadge);
    expect(dimBadge.width).toBeGreaterThanOrEqual(48);
    expect(dimBadge.height).toBeGreaterThanOrEqual(48);
  });
});

describe('Service Worker (client/public/sw.js)', () => {
  let listeners: Record<string, Function[]> = {};
  let showNotificationMock: ReturnType<typeof vi.fn>;
  let skipWaitingMock: ReturnType<typeof vi.fn>;
  let clientsClaimMock: ReturnType<typeof vi.fn>;
  let matchAllMock: ReturnType<typeof vi.fn>;
  let openWindowMock: ReturnType<typeof vi.fn>;
  let cachesOpenMock: ReturnType<typeof vi.fn>;
  let cachesMatchMock: ReturnType<typeof vi.fn>;
  let cachesKeysMock: ReturnType<typeof vi.fn>;
  let cachesDeleteMock: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let mockCache: {
    addAll: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    match: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    listeners = {};
    showNotificationMock = vi.fn().mockResolvedValue(undefined);
    skipWaitingMock = vi.fn().mockResolvedValue(undefined);
    clientsClaimMock = vi.fn().mockResolvedValue(undefined);
    matchAllMock = vi.fn().mockResolvedValue([]);
    openWindowMock = vi.fn().mockResolvedValue(undefined);

    const mockResponse = {
      status: 200,
      type: 'basic',
      clone: () => ({ status: 200, type: 'basic' }),
    };
    fetchMock = vi.fn().mockResolvedValue(mockResponse);

    mockCache = {
      addAll: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      match: vi.fn().mockResolvedValue(null),
    };

    cachesOpenMock = vi.fn().mockResolvedValue(mockCache);
    cachesMatchMock = vi.fn().mockResolvedValue(null);
    cachesKeysMock = vi.fn().mockResolvedValue(['old-cache-v0']);
    cachesDeleteMock = vi.fn().mockResolvedValue(true);
  });

  function loadServiceWorker() {
    expect(fs.existsSync(SW_PATH)).toBe(true);
    const swCode = fs.readFileSync(SW_PATH, 'utf-8');

    const sandbox = {
      self: {
        addEventListener: (event: string, handler: Function) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(handler);
        },
        registration: {
          showNotification: showNotificationMock,
        },
        skipWaiting: skipWaitingMock,
        clients: {
          claim: clientsClaimMock,
          matchAll: matchAllMock,
          openWindow: openWindowMock,
        },
      },
      clients: {
        claim: clientsClaimMock,
        matchAll: matchAllMock,
        openWindow: openWindowMock,
      },
      caches: {
        open: cachesOpenMock,
        match: cachesMatchMock,
        keys: cachesKeysMock,
        delete: cachesDeleteMock,
      },
      fetch: fetchMock,
      Response: class {},
      Request: class {},
      URL: globalThis.URL,
      Promise: globalThis.Promise,
      console,
    };

    // Also link self to sandbox global
    (sandbox as any).self.self = sandbox.self;
    (sandbox as any).self.caches = sandbox.caches;
    (sandbox as any).self.fetch = sandbox.fetch;

    const context = vm.createContext(sandbox);
    vm.runInContext(swCode, context);
  }

  it('parses sw.js syntax and registers expected event listeners', () => {
    loadServiceWorker();

    expect(listeners['install']?.length).toBeGreaterThanOrEqual(1);
    expect(listeners['activate']?.length).toBeGreaterThanOrEqual(1);
    expect(listeners['fetch']?.length).toBeGreaterThanOrEqual(1);
    expect(listeners['push']?.length).toBeGreaterThanOrEqual(1);
    expect(listeners['notificationclick']?.length).toBeGreaterThanOrEqual(1);
  });

  it('handles push event with payload and shows notification with tag couple-mood and renotify true', async () => {
    loadServiceWorker();

    const pushHandler = listeners['push'][0];
    let waitUntilPromise: Promise<any> | null = null;

    const payload = {
      title: 'Partner updated mood',
      body: 'Alice is feeling Loving 🥰',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge.png',
      data: { url: '/' },
    };

    const mockEvent = {
      data: {
        json: () => payload,
        text: () => JSON.stringify(payload),
      },
      waitUntil: (p: Promise<any>) => {
        waitUntilPromise = p;
      },
    };

    pushHandler(mockEvent);

    expect(waitUntilPromise).not.toBeNull();
    await waitUntilPromise;

    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    expect(showNotificationMock).toHaveBeenCalledWith(
      'Partner updated mood',
      expect.objectContaining({
        body: 'Alice is feeling Loving 🥰',
        tag: 'couple-mood',
        renotify: true,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge.png',
        data: { url: '/' },
      })
    );
  });

  it('handles push event with fallback defaults if payload is empty', async () => {
    loadServiceWorker();

    const pushHandler = listeners['push'][0];
    let waitUntilPromise: Promise<any> | null = null;

    const mockEvent = {
      data: null,
      waitUntil: (p: Promise<any>) => {
        waitUntilPromise = p;
      },
    };

    pushHandler(mockEvent);

    expect(waitUntilPromise).not.toBeNull();
    await waitUntilPromise;

    expect(showNotificationMock).toHaveBeenCalledTimes(1);
    const [title, options] = showNotificationMock.mock.calls[0];
    expect(title).toBe('Mood Sender');
    expect(options.tag).toBe('couple-mood');
    expect(options.renotify).toBe(true);
    expect(typeof options.body).toBe('string');
    expect(options.data.url).toBe('/');
  });

  it('normalizes top-level url in push payload to data.url', async () => {
    loadServiceWorker();

    const pushHandler = listeners['push'][0];
    let waitUntilPromise: Promise<any> | null = null;

    const payload = {
      title: 'Partner updated',
      url: '/partner-view',
    };

    const mockEvent = {
      data: {
        json: () => payload,
        text: () => JSON.stringify(payload),
      },
      waitUntil: (p: Promise<any>) => {
        waitUntilPromise = p;
      },
    };

    pushHandler(mockEvent);

    expect(waitUntilPromise).not.toBeNull();
    await waitUntilPromise;

    expect(showNotificationMock).toHaveBeenCalledWith(
      'Partner updated',
      expect.objectContaining({
        data: expect.objectContaining({ url: '/partner-view' }),
      })
    );
  });

  it('handles notificationclick event: focuses existing open window and posts REFRESH_MOOD message', async () => {
    loadServiceWorker();

    const clickHandler = listeners['notificationclick'][0];
    let waitUntilPromise: Promise<any> | null = null;

    const closeMock = vi.fn();
    const focusMock = vi.fn().mockResolvedValue(undefined);
    const postMessageMock = vi.fn();

    const mockClient = {
      url: 'http://localhost:3000/',
      focus: focusMock,
      postMessage: postMessageMock,
    };

    matchAllMock.mockResolvedValue([mockClient]);

    const mockEvent = {
      notification: {
        close: closeMock,
        data: { url: '/' },
      },
      waitUntil: (p: Promise<any>) => {
        waitUntilPromise = p;
      },
    };

    clickHandler(mockEvent);

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(waitUntilPromise).not.toBeNull();
    await waitUntilPromise;

    expect(matchAllMock).toHaveBeenCalled();
    expect(focusMock).toHaveBeenCalledTimes(1);
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'REFRESH_MOOD' });
    expect(openWindowMock).not.toHaveBeenCalled();
  });

  it('handles notificationclick event: opens new window if no matching client open', async () => {
    loadServiceWorker();

    const clickHandler = listeners['notificationclick'][0];
    let waitUntilPromise: Promise<any> | null = null;

    const closeMock = vi.fn();
    matchAllMock.mockResolvedValue([]);

    const mockEvent = {
      notification: {
        close: closeMock,
        data: { url: '/' },
      },
      waitUntil: (p: Promise<any>) => {
        waitUntilPromise = p;
      },
    };

    clickHandler(mockEvent);

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(waitUntilPromise).not.toBeNull();
    await waitUntilPromise;

    expect(openWindowMock).toHaveBeenCalledWith('/');
  });

  it('caches shell assets on install and calls skipWaiting', async () => {
    loadServiceWorker();

    const installHandler = listeners['install'][0];
    let waitUntilPromise: Promise<any> | null = null;

    installHandler({
      waitUntil: (p: Promise<any>) => {
        waitUntilPromise = p;
      },
    });

    expect(waitUntilPromise).not.toBeNull();
    await waitUntilPromise;

    expect(cachesOpenMock).toHaveBeenCalled();
    expect(mockCache.addAll).toHaveBeenCalledWith(
      expect.arrayContaining([
        '/',
        '/manifest.json',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/badge.png',
      ])
    );
    expect(skipWaitingMock).toHaveBeenCalled();
  });

  it('cleans up old caches on activate and claims clients without deleting current cache', async () => {
    loadServiceWorker();

    cachesKeysMock.mockResolvedValue(['mood-sender-v1', 'old-cache-v0', 'another-v2']);

    const activateHandler = listeners['activate'][0];
    let waitUntilPromise: Promise<any> | null = null;

    activateHandler({
      waitUntil: (p: Promise<any>) => {
        waitUntilPromise = p;
      },
    });

    expect(waitUntilPromise).not.toBeNull();
    await waitUntilPromise;

    expect(cachesKeysMock).toHaveBeenCalled();
    expect(cachesDeleteMock).toHaveBeenCalledTimes(2);
    expect(cachesDeleteMock).toHaveBeenCalledWith('old-cache-v0');
    expect(cachesDeleteMock).toHaveBeenCalledWith('another-v2');
    expect(cachesDeleteMock).not.toHaveBeenCalledWith('mood-sender-v1');
    expect(clientsClaimMock).toHaveBeenCalled();
  });

  it('fetch listener delegates network-first for /api requests', async () => {
    loadServiceWorker();

    const fetchHandler = listeners['fetch'][0];
    let respondWithPromise: Promise<any> | null = null;

    const apiRequest = {
      url: 'http://localhost:3000/api/mood',
      method: 'GET',
    };
    fetchHandler({
      request: apiRequest,
      respondWith: (val: Promise<any>) => {
        respondWithPromise = val;
      },
    });

    expect(respondWithPromise).not.toBeNull();
    const res = await respondWithPromise;
    expect(fetchMock).toHaveBeenCalledWith(apiRequest);
    expect(mockCache.put).toHaveBeenCalledWith(apiRequest, expect.anything());
    expect(res.status).toBe(200);
  });

  it('fetch listener falls back to cache for /api requests when network fails', async () => {
    loadServiceWorker();

    const fetchHandler = listeners['fetch'][0];
    let respondWithPromise: Promise<any> | null = null;

    fetchMock.mockRejectedValueOnce(new Error('Network error'));
    const cachedResponse = { status: 200, fromCache: true };
    cachesMatchMock.mockResolvedValueOnce(cachedResponse);

    const apiRequest = {
      url: 'http://localhost:3000/api/mood',
      method: 'GET',
    };
    fetchHandler({
      request: apiRequest,
      respondWith: (val: Promise<any>) => {
        respondWithPromise = val;
      },
    });

    expect(respondWithPromise).not.toBeNull();
    const res = await respondWithPromise;
    expect(res).toBe(cachedResponse);
  });

  it('fetch listener bypasses cache for /api/stream SSE connections', () => {
    loadServiceWorker();

    const fetchHandler = listeners['fetch'][0];
    let respondWithCalled = false;

    const streamRequest = {
      url: 'http://localhost:3000/api/stream',
      method: 'GET',
    };
    fetchHandler({
      request: streamRequest,
      respondWith: () => {
        respondWithCalled = true;
      },
    });

    expect(respondWithCalled).toBe(false);
  });

  it('fetch listener serves cached assets first for static requests', async () => {
    loadServiceWorker();

    const fetchHandler = listeners['fetch'][0];
    let respondWithPromise: Promise<any> | null = null;

    const cachedAsset = { status: 200, body: 'static asset' };
    cachesMatchMock.mockResolvedValueOnce(cachedAsset);

    const assetRequest = {
      url: 'http://localhost:3000/icons/icon-192.png',
      method: 'GET',
    };
    fetchHandler({
      request: assetRequest,
      respondWith: (val: Promise<any>) => {
        respondWithPromise = val;
      },
    });

    expect(respondWithPromise).not.toBeNull();
    const res = await respondWithPromise;
    expect(res).toBe(cachedAsset);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetch listener fetches and caches static assets on cache miss', async () => {
    loadServiceWorker();

    const fetchHandler = listeners['fetch'][0];
    let respondWithPromise: Promise<any> | null = null;

    cachesMatchMock.mockResolvedValueOnce(null);

    const assetRequest = {
      url: 'http://localhost:3000/manifest.json',
      method: 'GET',
    };
    fetchHandler({
      request: assetRequest,
      respondWith: (val: Promise<any>) => {
        respondWithPromise = val;
      },
    });

    expect(respondWithPromise).not.toBeNull();
    const res = await respondWithPromise;
    expect(fetchMock).toHaveBeenCalledWith(assetRequest);
    expect(mockCache.put).toHaveBeenCalledWith(assetRequest, expect.anything());
    expect(res.status).toBe(200);
  });
});
