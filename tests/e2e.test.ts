import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import webpush from 'web-push';
import type { Express } from 'express';
import { createProductionApp } from '../server/src/index.js';
import { initDb, closeDb, getSession } from '../server/src/db.js';
import { closeAllConnections } from '../server/src/sse.js';

function extractSessionToken(cookies?: string[] | string): string {
  const raw = Array.isArray(cookies) ? cookies.join('; ') : (cookies || '');
  const match = raw.match(/mood_session=([^;]+)/);
  return match ? match[1] : '';
}

describe('CoupleMood End-to-End Verification & Production Integration', () => {
  let app: Express;
  let sendNotificationSpy: any;

  beforeEach(() => {
    initDb(':memory:');
    app = createProductionApp();
    sendNotificationSpy = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as any);
  });

  afterEach(() => {
    closeAllConnections();
    closeDb();
    vi.restoreAllMocks();
  });

  describe('Static Assets & SPA Hosting', () => {
    it('serves /sw.js with Service-Worker-Allowed: / and no-cache headers', async () => {
      const res = await request(app).get('/sw.js');
      expect(res.status).toBe(200);
      expect(res.headers['service-worker-allowed']).toBe('/');
      expect(res.headers['cache-control']).toMatch(/no-cache/);
      expect(res.headers['content-type']).toMatch(/javascript/);
      expect(res.text).toContain('mood-sender-v1');
    });

    it('serves client SPA on GET / with index.html content', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('Mood Sender');
    });

    it('falls back to index.html for SPA routes (e.g. /dashboard, /pair)', async () => {
      const res = await request(app).get('/dashboard');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('Mood Sender');
    });

    it('does NOT serve SPA HTML for unhandled /api/* routes, returns 404 JSON', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Endpoint not found');
      expect(res.text).not.toContain('<!DOCTYPE html>');
    });
  });

  describe('Complete E2E Couple Lifecycle', () => {
    it('executes full 9-step partner interaction scenario', async () => {
      // 1. Partner A (Alice) pairs with code COUPLE-TEST
      const pairResA = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'COUPLE-TEST', nickname: 'Alice' });

      expect(pairResA.status).toBe(200);
      expect(pairResA.body.user).toBeDefined();
      expect(pairResA.body.user.nickname).toBe('Alice');
      expect(pairResA.body.user.slot).toBe(1);
      expect(pairResA.body.couple.code).toBe('COUPLE-TEST');
      expect(pairResA.body.partner).toBeNull();

      const cookieA = pairResA.headers['set-cookie'];
      expect(cookieA).toBeDefined();
      const tokenA = extractSessionToken(cookieA);
      expect(tokenA).toBeTruthy();
      expect(getSession(tokenA)).not.toBeNull();

      // 2. Partner B (Bob) pairs with same code COUPLE-TEST
      const pairResB = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'COUPLE-TEST', nickname: 'Bob' });

      expect(pairResB.status).toBe(200);
      expect(pairResB.body.user).toBeDefined();
      expect(pairResB.body.user.nickname).toBe('Bob');
      expect(pairResB.body.user.slot).toBe(2);
      expect(pairResB.body.couple.code).toBe('COUPLE-TEST');
      expect(pairResB.body.partner).toBeDefined();
      expect(pairResB.body.partner.nickname).toBe('Alice');
      expect(pairResB.body.partner.id).toBe(pairResA.body.user.id);

      const cookieB = pairResB.headers['set-cookie'];
      expect(cookieB).toBeDefined();

      // 3. Verify both see each other as partners
      const sessionResA = await request(app)
        .get('/api/auth/session')
        .set('Cookie', cookieA);

      expect(sessionResA.status).toBe(200);
      expect(sessionResA.body.user.nickname).toBe('Alice');
      expect(sessionResA.body.partner).toBeDefined();
      expect(sessionResA.body.partner.nickname).toBe('Bob');
      expect(sessionResA.body.partner.id).toBe(pairResB.body.user.id);

      const sessionResB = await request(app)
        .get('/api/auth/session')
        .set('Cookie', cookieB);

      expect(sessionResB.status).toBe(200);
      expect(sessionResB.body.user.nickname).toBe('Bob');
      expect(sessionResB.body.partner).toBeDefined();
      expect(sessionResB.body.partner.nickname).toBe('Alice');
      expect(sessionResB.body.partner.id).toBe(pairResA.body.user.id);

      // 4. Partner A posts mood: { emoji: '🥰', label: 'Loving', note: 'Can not wait for dinner!' }
      const moodPayload = {
        emoji: '🥰',
        label: 'Loving',
        note: 'Can not wait for dinner!',
        colorTheme: 'rose'
      };

      const postMoodResA = await request(app)
        .post('/api/mood')
        .set('Cookie', cookieA)
        .send(moodPayload);

      expect(postMoodResA.status).toBe(200);
      expect(postMoodResA.body.mood).toBeDefined();
      expect(postMoodResA.body.mood.emoji).toBe('🥰');
      expect(postMoodResA.body.mood.label).toBe('Loving');
      expect(postMoodResA.body.mood.note).toBe('Can not wait for dinner!');
      expect(postMoodResA.body.mood.updated_at).toBeDefined();

      // 5. Partner B retrieves mood and sees Alice's mood and timestamp
      const getMoodResB = await request(app)
        .get('/api/mood')
        .set('Cookie', cookieB);

      expect(getMoodResB.status).toBe(200);
      expect(getMoodResB.body.partnerMood).toBeDefined();
      expect(getMoodResB.body.partnerMood.emoji).toBe('🥰');
      expect(getMoodResB.body.partnerMood.label).toBe('Loving');
      expect(getMoodResB.body.partnerMood.note).toBe('Can not wait for dinner!');
      expect(getMoodResB.body.partnerMood.updated_at).toBe(postMoodResA.body.mood.updated_at);
      expect(getMoodResB.body.myMood).toBeNull();

      // 6. Partner A clears mood; Partner B sees mood is cleared
      const deleteMoodResA = await request(app)
        .delete('/api/mood')
        .set('Cookie', cookieA);

      expect(deleteMoodResA.status).toBe(200);

      const getMoodResBAfterClear = await request(app)
        .get('/api/mood')
        .set('Cookie', cookieB);

      expect(getMoodResBAfterClear.status).toBe(200);
      expect(getMoodResBAfterClear.body.partnerMood).toBeNull();
      expect(getMoodResBAfterClear.body.myMood).toBeNull();

      // 7. Partner C attempts pairing with COUPLE-TEST and is rejected with 409 Conflict
      const pairResC = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'COUPLE-TEST', nickname: 'Charlie' });

      expect(pairResC.status).toBe(409);
      expect(pairResC.body.error).toMatch(/couple code is full/i);

      // 8. Web Push subscription registration and notification dispatch simulation
      const bobPushSubscription = {
        endpoint: 'https://push.example.com/subscriptions/bob-mobile',
        keys: {
          p256dh: 'BNcRdreALRF8Fs7E85b7-7N87Cgf...',
          auth: 'tBHItDaA3-7P...'
        }
      };

      const subscribeResB = await request(app)
        .post('/api/push/subscribe')
        .set('Cookie', cookieB)
        .send(bobPushSubscription);

      expect(subscribeResB.status).toBe(200);
      expect(subscribeResB.body.success).toBe(true);

      // Alice posts a new mood, triggering push notification to Bob
      sendNotificationSpy.mockClear();
      await request(app)
        .post('/api/mood')
        .set('Cookie', cookieA)
        .send({
          emoji: '✨',
          label: 'Excited',
          note: 'Surprise gift ready!'
        });

      expect(sendNotificationSpy).toHaveBeenCalledTimes(1);
      const [subArg, payloadArg] = sendNotificationSpy.mock.calls[0];
      expect(subArg.endpoint).toBe('https://push.example.com/subscriptions/bob-mobile');
      const pushPayload = JSON.parse(payloadArg as string);
      expect(pushPayload.title).toContain('Alice');
      expect(pushPayload.body).toContain('Excited');
      expect(pushPayload.body).toContain('Surprise gift ready!');
      expect(pushPayload.data?.type).toBe('mood_update');
      expect(pushPayload.data?.mood?.emoji).toBe('✨');

      // 9. Partner A unpairs and confirms session cookie & session token are destroyed
      const unpairResA = await request(app)
        .post('/api/auth/unpair')
        .set('Cookie', cookieA);

      expect(unpairResA.status).toBe(200);

      // Check cleared cookie
      const unpairCookieHeader = unpairResA.headers['set-cookie'];
      expect(unpairCookieHeader).toBeDefined();
      const rawCookieString = Array.isArray(unpairCookieHeader)
        ? unpairCookieHeader.join('; ')
        : unpairCookieHeader;
      expect(rawCookieString).toMatch(/mood_session=;/);

      // Check token in DB is removed
      expect(getSession(tokenA)).toBeNull();

      // Subsequent session check for Alice returns 401 Unauthorized
      const sessionAfterUnpairA = await request(app)
        .get('/api/auth/session')
        .set('Cookie', cookieA);

      expect(sessionAfterUnpairA.status).toBe(401);
    });

    it('simulates live SSE broadcasts between partners', async () => {
      // Pair Alice & Bob
      const pairA = await request(app).post('/api/auth/pair').send({ code: 'SSE-E2E', nickname: 'Alice' });
      const pairB = await request(app).post('/api/auth/pair').send({ code: 'SSE-E2E', nickname: 'Bob' });

      const cookieA = (pairA.headers['set-cookie'] as unknown as string[])[0];
      const cookieB = (pairB.headers['set-cookie'] as unknown as string[])[0];

      // Bind ephemeral HTTP server for SSE stream testing
      const server = app.listen(0);
      const port = (server.address() as any).port;
      const controller = new AbortController();

      try {
        // Bob opens SSE stream
        const response = await fetch(`http://127.0.0.1:${port}/api/stream`, {
          headers: { Cookie: cookieB },
          signal: controller.signal
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/event-stream');

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        // 1. Initial connection ping
        const firstChunk = await reader?.read();
        const initialText = decoder.decode(firstChunk?.value);
        expect(initialText).toContain(': connected');

        // 2. Alice posts mood -> Bob receives mood_update event via SSE
        await request(app)
          .post('/api/mood')
          .set('Cookie', cookieA)
          .send({ emoji: '☕', label: 'Cozy' });

        const moodChunk = await reader?.read();
        const moodText = decoder.decode(moodChunk?.value);
        expect(moodText).toContain('event: mood_update');
        expect(moodText).toContain('Cozy');
        expect(moodText).toContain('☕');

        // 3. Alice clears mood -> Bob receives mood_cleared event via SSE
        await request(app)
          .delete('/api/mood')
          .set('Cookie', cookieA);

        const clearChunk = await reader?.read();
        const clearText = decoder.decode(clearChunk?.value);
        expect(clearText).toContain('event: mood_cleared');
      } finally {
        controller.abort();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
