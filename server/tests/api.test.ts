import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import webpush from 'web-push';
import { createApp } from '../src/app.js';
import { initDb, closeDb, getDb, getSession, getPushSubscriptions } from '../src/db.js';
import { closeAllConnections } from '../src/sse.js';
import type { Express } from 'express';

describe('Backend API Routes, SSE & Web Push Integration', () => {
  let app: Express;

  beforeEach(() => {
    initDb(':memory:');
    app = createApp();
  });

  afterEach(() => {
    closeAllConnections();
    closeDb();
    vi.restoreAllMocks();
  });

  describe('1. Auth Routes (/api/auth)', () => {
    it('POST /api/auth/pair creates session cookie and returns user, couple, partner', async () => {
      const res = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'LOVE-1234', nickname: 'Alice' });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.nickname).toBe('Alice');
      expect(res.body.user.slot).toBe(1);
      expect(res.body.couple.code).toBe('LOVE-1234');
      expect(res.body.partner).toBeNull();

      // Check cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const sessionCookie = (cookies as unknown as string[]).find((c) => c.startsWith('mood_session='));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('Path=/');
    });

    it('POST /api/auth/pair pairs second user with slot 2 and detects partner', async () => {
      // User 1
      const res1 = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PAIR-9999', nickname: 'Alice' });
      expect(res1.status).toBe(200);

      // User 2
      const res2 = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PAIR-9999', nickname: 'Bob' });
      expect(res2.status).toBe(200);
      expect(res2.body.user.nickname).toBe('Bob');
      expect(res2.body.user.slot).toBe(2);
      expect(res2.body.partner).toBeDefined();
      expect(res2.body.partner.id).toBe(res1.body.user.id);
      expect(res2.body.partner.nickname).toBe('Alice');
    });

    it('POST /api/auth/pair allows existing members to rejoin full room (case-insensitive)', async () => {
      const res1 = await request(app).post('/api/auth/pair').send({ code: 'REJOIN-API', nickname: 'Alice' });
      const res2 = await request(app).post('/api/auth/pair').send({ code: 'REJOIN-API', nickname: 'Bob' });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Alice rejoins with lowercase nickname
      const rejoinRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'REJOIN-API', nickname: 'alice' });

      expect(rejoinRes.status).toBe(200);
      expect(rejoinRes.body.user.id).toBe(res1.body.user.id);
      expect(rejoinRes.body.user.nickname).toBe('Alice');
      expect(rejoinRes.body.partner.id).toBe(res2.body.user.id);
      expect(rejoinRes.headers['set-cookie']).toBeDefined();
    });

    it('POST /api/auth/pair rejects 3rd user with 409 and locks out after 5 failures with 429', async () => {
      await request(app).post('/api/auth/pair').send({ code: 'FULL-8888', nickname: 'Alice' });
      await request(app).post('/api/auth/pair').send({ code: 'FULL-8888', nickname: 'Bob' });

      // 4 failed attempts
      for (let i = 1; i <= 4; i++) {
        const res = await request(app)
          .post('/api/auth/pair')
          .send({ code: 'FULL-8888', nickname: `Wrong${i}` });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/Couple code is full/i);
      }

      // 5th failed attempt triggers 429 Too Many Requests
      const res5 = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'FULL-8888', nickname: 'Wrong5' });
      expect(res5.status).toBe(429);
      expect(res5.body.error).toMatch(/Too many failed join attempts/i);
      expect(res5.body.waitSeconds).toBeGreaterThan(0);
    });

    it('POST /api/auth/pair rejects empty or invalid body with 400', async () => {
      const res1 = await request(app).post('/api/auth/pair').send({ code: '', nickname: 'Alice' });
      expect(res1.status).toBe(400);

      const res2 = await request(app).post('/api/auth/pair').send({ code: 'TEST', nickname: '' });
      expect(res2.status).toBe(400);
    });

    it('GET /api/auth/session returns 401 when no session cookie is provided', async () => {
      const res = await request(app).get('/api/auth/session');
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('GET /api/auth/session validates session and returns user and partner info', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'SESS-1111', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      const sessionRes = await request(app)
        .get('/api/auth/session')
        .set('Cookie', cookie);

      expect(sessionRes.status).toBe(200);
      expect(sessionRes.body.user.id).toBe(pairRes.body.user.id);
      expect(sessionRes.body.user.nickname).toBe('Alice');
      expect(sessionRes.body.couple.code).toBe('SESS-1111');
    });

    it('GET /api/auth/session clears cookie and returns 401 if session is invalid or expired', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'EXP-1234', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      // Manually expire session in DB
      const db = getDb();
      db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 hour')").run();

      const res = await request(app)
        .get('/api/auth/session')
        .set('Cookie', cookie);

      expect(res.status).toBe(401);
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
    });

    it('POST /api/auth/unpair clears session cookie and removes session from DB', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'UNPAIR-1', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      const unpairRes = await request(app)
        .post('/api/auth/unpair')
        .set('Cookie', cookie);

      expect(unpairRes.status).toBe(200);

      // Verify cookie cleared
      const setCookie = unpairRes.headers['set-cookie'];
      expect(setCookie).toBeDefined();

      // Subsequent session check should return 401
      const sessionRes = await request(app)
        .get('/api/auth/session')
        .set('Cookie', cookie);
      expect(sessionRes.status).toBe(401);
    });
  });

  describe('2. Push Notification Routes (/api/push)', () => {
    it('GET /api/push/key returns public VAPID key without requiring authentication', async () => {
      const res = await request(app).get('/api/push/key');
      expect(res.status).toBe(200);
      expect(res.body.publicKey).toBeDefined();
      expect(typeof res.body.publicKey).toBe('string');
      expect(res.body.publicKey.length).toBeGreaterThan(20);
    });

    it('POST /api/push/subscribe requires authentication', async () => {
      const res = await request(app)
        .post('/api/push/subscribe')
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/fake-sub',
          keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' }
        });
      expect(res.status).toBe(401);
    });

    it('POST /api/push/subscribe stores subscription for authenticated user', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PUSH-001', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      const res = await request(app)
        .post('/api/push/subscribe')
        .set('Cookie', cookie)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-alice',
          keys: { p256dh: 'p256dh-key-alice', auth: 'auth-key-alice' }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify in DB
      const subs = getPushSubscriptions(pairRes.body.user.id);
      expect(subs.length).toBe(1);
      expect(subs[0].endpoint).toBe('https://fcm.googleapis.com/fcm/send/test-alice');
      expect(subs[0].p256dh).toBe('p256dh-key-alice');
    });

    it('POST /api/push/unsubscribe removes subscription for authenticated user', async () => {
      const pairRes = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'PUSH-002', nickname: 'Alice' });
      const cookie = pairRes.headers['set-cookie'];

      await request(app)
        .post('/api/push/subscribe')
        .set('Cookie', cookie)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/to-remove',
          keys: { p256dh: 'p256dh', auth: 'auth' }
        });

      const unsubRes = await request(app)
        .post('/api/push/unsubscribe')
        .set('Cookie', cookie)
        .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/to-remove' });

      expect(unsubRes.status).toBe(200);

      const subs = getPushSubscriptions(pairRes.body.user.id);
      expect(subs.length).toBe(0);
    });
  });

  describe('3. Mood Routes (/api/mood)', () => {
    it('GET /api/mood requires authentication', async () => {
      const res = await request(app).get('/api/mood');
      expect(res.status).toBe(401);
    });

    it('POST /api/mood upserts mood and triggers push notification to partner', async () => {
      // Setup pair
      const u1Res = await request(app).post('/api/auth/pair').send({ code: 'MOOD-123', nickname: 'Alice' });
      const u2Res = await request(app).post('/api/auth/pair').send({ code: 'MOOD-123', nickname: 'Bob' });

      const aliceCookie = u1Res.headers['set-cookie'];
      const bobCookie = u2Res.headers['set-cookie'];

      // Add push subscription for Bob
      await request(app)
        .post('/api/push/subscribe')
        .set('Cookie', bobCookie)
        .send({
          endpoint: 'https://push.example.com/bob',
          keys: { p256dh: 'key1', auth: 'key2' }
        });

      // Mock webpush.sendNotification
      const sendSpy = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as any);

      // Alice posts mood
      const postRes = await request(app)
        .post('/api/mood')
        .set('Cookie', aliceCookie)
        .send({
          emoji: '🥰',
          label: 'Loving',
          note: 'Thinking about you!',
          colorTheme: 'rose'
        });

      expect(postRes.status).toBe(200);
      expect(postRes.body.mood).toBeDefined();
      expect(postRes.body.mood.emoji).toBe('🥰');
      expect(postRes.body.mood.label).toBe('Loving');
      expect(postRes.body.mood.note).toBe('Thinking about you!');
      expect(postRes.body.mood.color_theme).toBe('rose');

      // Verify push notification was sent to Bob's subscription
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const [subArg, payloadArg] = sendSpy.mock.calls[0];
      expect((subArg as any).endpoint).toBe('https://push.example.com/bob');
      const payload = JSON.parse(payloadArg as string);
      expect(payload.title).toContain('Alice');
      expect(payload.body).toContain('Loving');
    });

    it('GET /api/mood returns user and partner moods', async () => {
      const u1Res = await request(app).post('/api/auth/pair').send({ code: 'MOOD-456', nickname: 'Alice' });
      const u2Res = await request(app).post('/api/auth/pair').send({ code: 'MOOD-456', nickname: 'Bob' });

      const aliceCookie = u1Res.headers['set-cookie'];
      const bobCookie = u2Res.headers['set-cookie'];

      // Initially both null
      const initialGet = await request(app).get('/api/mood').set('Cookie', aliceCookie);
      expect(initialGet.status).toBe(200);
      expect(initialGet.body.myMood).toBeNull();
      expect(initialGet.body.partnerMood).toBeNull();
      expect(initialGet.body.partner.nickname).toBe('Bob');

      // Alice posts mood
      await request(app)
        .post('/api/mood')
        .set('Cookie', aliceCookie)
        .send({ emoji: '☕', label: 'Cozy', note: 'Hot tea time' });

      // Bob posts mood
      await request(app)
        .post('/api/mood')
        .set('Cookie', bobCookie)
        .send({ emoji: '😴', label: 'Sleepy', colorTheme: 'lavender' });

      // Alice checks GET /api/mood
      const aliceCheck = await request(app).get('/api/mood').set('Cookie', aliceCookie);
      expect(aliceCheck.body.myMood.emoji).toBe('☕');
      expect(aliceCheck.body.partnerMood.emoji).toBe('😴');

      // Bob checks GET /api/mood
      const bobCheck = await request(app).get('/api/mood').set('Cookie', bobCookie);
      expect(bobCheck.body.myMood.emoji).toBe('😴');
      expect(bobCheck.body.partnerMood.emoji).toBe('☕');
    });

    it('DELETE /api/mood clears user mood and dispatches notification', async () => {
      const u1Res = await request(app).post('/api/auth/pair').send({ code: 'MOOD-789', nickname: 'Alice' });
      const u2Res = await request(app).post('/api/auth/pair').send({ code: 'MOOD-789', nickname: 'Bob' });

      const aliceCookie = u1Res.headers['set-cookie'];
      const bobCookie = u2Res.headers['set-cookie'];

      await request(app)
        .post('/api/push/subscribe')
        .set('Cookie', bobCookie)
        .send({
          endpoint: 'https://push.example.com/bob-sub',
          keys: { p256dh: 'k1', auth: 'k2' }
        });

      const sendSpy = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as any);

      // Set mood then delete
      await request(app)
        .post('/api/mood')
        .set('Cookie', aliceCookie)
        .send({ emoji: '🔥', label: 'Busy' });

      sendSpy.mockClear();

      const deleteRes = await request(app)
        .delete('/api/mood')
        .set('Cookie', aliceCookie);

      expect(deleteRes.status).toBe(200);

      // Verify Alice has no mood
      const checkRes = await request(app).get('/api/mood').set('Cookie', aliceCookie);
      expect(checkRes.body.myMood).toBeNull();

      // Verify push sent to partner about mood cleared
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const [, payloadArg] = sendSpy.mock.calls[0];
      const payload = JSON.parse(payloadArg as string);
      expect(payload.title).toContain('Alice');
      expect(payload.body).toContain('cleared');
    });

    it('POST /api/mood rejects invalid body without emoji or label', async () => {
      const uRes = await request(app).post('/api/auth/pair').send({ code: 'VAL-123', nickname: 'Alice' });
      const cookie = uRes.headers['set-cookie'];

      const res1 = await request(app).post('/api/mood').set('Cookie', cookie).send({ emoji: '' });
      expect(res1.status).toBe(400);

      const res2 = await request(app).post('/api/mood').set('Cookie', cookie).send({ label: '' });
      expect(res2.status).toBe(400);
    });

    it('POST /api/mood rejects note longer than 100 characters with 400', async () => {
      const uRes = await request(app).post('/api/auth/pair').send({ code: 'LONG-1', nickname: 'Alice' });
      const cookie = uRes.headers['set-cookie'];

      const longNote = 'a'.repeat(101);
      const res = await request(app)
        .post('/api/mood')
        .set('Cookie', cookie)
        .send({ emoji: '✨', label: 'Excited', note: longNote });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('100 characters');
    });
  });

  describe('4. Push Auto-pruning on 410 Gone / 404 Not Found', () => {
    it('automatically prunes expired subscriptions from the database when push fails with 410 or 404', async () => {
      const u1Res = await request(app).post('/api/auth/pair').send({ code: 'PRUNE-1', nickname: 'Alice' });
      const u2Res = await request(app).post('/api/auth/pair').send({ code: 'PRUNE-1', nickname: 'Bob' });

      const aliceCookie = u1Res.headers['set-cookie'];
      const bobCookie = u2Res.headers['set-cookie'];

      // Add 2 subscriptions for Bob: one that will fail with 410, one valid
      await request(app)
        .post('/api/push/subscribe')
        .set('Cookie', bobCookie)
        .send({
          endpoint: 'https://push.example.com/expired-410',
          keys: { p256dh: 'k1', auth: 'k2' }
        });

      await request(app)
        .post('/api/push/subscribe')
        .set('Cookie', bobCookie)
        .send({
          endpoint: 'https://push.example.com/valid-sub',
          keys: { p256dh: 'k3', auth: 'k4' }
        });

      expect(getPushSubscriptions(u2Res.body.user.id).length).toBe(2);

      // Mock webpush: 410 for expired-410, 201 for valid-sub
      vi.spyOn(webpush, 'sendNotification').mockImplementation(async (sub: any) => {
        if (sub.endpoint.includes('expired-410')) {
          const error: any = new Error('Gone');
          error.statusCode = 410;
          throw error;
        }
        return {} as any;
      });

      // Alice updates mood (triggers push to Bob)
      const res = await request(app)
        .post('/api/mood')
        .set('Cookie', aliceCookie)
        .send({ emoji: '✨', label: 'Excited' });

      expect(res.status).toBe(200);

      // Verify the 410 subscription was pruned, valid subscription remains
      const remainingSubs = getPushSubscriptions(u2Res.body.user.id);
      expect(remainingSubs.length).toBe(1);
      expect(remainingSubs[0].endpoint).toBe('https://push.example.com/valid-sub');
    });
  });

  describe('5. Live SSE Stream (/api/stream)', () => {
    it('GET /api/stream requires authentication', async () => {
      const res = await request(app).get('/api/stream');
      expect(res.status).toBe(401);
    });

    it('GET /api/stream establishes SSE connection and receives headers', async () => {
      const uRes = await request(app).post('/api/auth/pair').send({ code: 'SSE-001', nickname: 'Alice' });
      const cookie = (uRes.headers['set-cookie'] as unknown as string[])[0];

      const server = app.listen(0);
      const port = (server.address() as any).port;

      const controller = new AbortController();
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/stream`, {
          headers: { Cookie: cookie },
          signal: controller.signal
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/event-stream');
        expect(response.headers.get('cache-control')).toContain('no-cache');
      } finally {
        controller.abort();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('GET /api/stream receives mood_update event when partner updates mood', async () => {
      const u1Res = await request(app).post('/api/auth/pair').send({ code: 'SSE-002', nickname: 'Alice' });
      const u2Res = await request(app).post('/api/auth/pair').send({ code: 'SSE-002', nickname: 'Bob' });

      const aliceCookie = (u1Res.headers['set-cookie'] as unknown as string[])[0];
      const bobCookie = (u2Res.headers['set-cookie'] as unknown as string[])[0];

      const server = app.listen(0);
      const port = (server.address() as any).port;

      const controller = new AbortController();
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/stream`, {
          headers: { Cookie: aliceCookie },
          signal: controller.signal
        });

        expect(response.status).toBe(200);

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        // Read initial connection message ": connected\n\n"
        const initialChunk = await reader?.read();
        const initialText = decoder.decode(initialChunk?.value);
        expect(initialText).toContain(': connected');

        // Bob updates mood
        await request(app)
          .post('/api/mood')
          .set('Cookie', bobCookie)
          .send({ emoji: '🎉', label: 'Celebrating' });

        // Alice receives SSE event
        const eventChunk = await reader?.read();
        const eventText = decoder.decode(eventChunk?.value);
        expect(eventText).toContain('event: mood_update');
        expect(eventText).toContain('Celebrating');
      } finally {
        controller.abort();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe('6. Deferred Task 1: NaN Session Expiration Protection', () => {
    it('safely deletes session and returns null if expires_at is NaN or invalid date', () => {
      const db = getDb();
      db.prepare(
        "INSERT INTO couples (id, code) VALUES ('c1', 'NAN-TEST')"
      ).run();
      db.prepare(
        "INSERT INTO users (id, couple_id, nickname, slot) VALUES ('u1', 'c1', 'Alice', 1)"
      ).run();
      db.prepare(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES ('invalid-date-token', 'u1', 'invalid-date-string')"
      ).run();

      const session = getSession('invalid-date-token');
      expect(session).toBeNull();

      // Ensure invalid row was purged
      const row = db.prepare("SELECT * FROM sessions WHERE token = 'invalid-date-token'").get();
      expect(row).toBeUndefined();
    });
  });

  describe('7. App Factory & Custom DB Wiring', () => {
    it('createApp configures custom database instance when passed', async () => {
      const customDb = initDb(':memory:');
      const customApp = createApp(customDb);
      const res = await request(customApp).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
