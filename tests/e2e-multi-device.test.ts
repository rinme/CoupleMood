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

describe('Multi-Device OTP & QR Account Linking E2E', () => {
  let app: Express;

  beforeEach(() => {
    initDb(':memory:');
    app = createProductionApp();
    vi.spyOn(webpush, 'sendNotification').mockResolvedValue({} as any);
  });

  afterEach(() => {
    closeAllConnections();
    closeDb();
    vi.restoreAllMocks();
  });

  describe('Complete 11-Step Multi-Device Lifecycle', () => {
    it('pairs, links device via OTP, syncs mood across devices, logs out single device, and unpairs', async () => {
      // Step 1: Device 1 (Alice) pairs with couple code COUPLE-MULTI (Slot 1)
      const pairAlice = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'COUPLE-MULTI', nickname: 'Alice' });

      expect(pairAlice.status).toBe(200);
      expect(pairAlice.body.user.nickname).toBe('Alice');
      expect(pairAlice.body.user.slot).toBe(1);
      expect(pairAlice.body.couple.code).toBe('COUPLE-MULTI');
      expect(pairAlice.body.partner).toBeNull();

      const cookieDevice1 = pairAlice.headers['set-cookie'];
      const tokenDevice1 = extractSessionToken(cookieDevice1);
      expect(tokenDevice1).toBeTruthy();

      // Step 2: Device 2 (Bob) pairs with couple code COUPLE-MULTI (Slot 2)
      const pairBob = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'COUPLE-MULTI', nickname: 'Bob' });

      expect(pairBob.status).toBe(200);
      expect(pairBob.body.user.nickname).toBe('Bob');
      expect(pairBob.body.user.slot).toBe(2);
      expect(pairBob.body.partner.nickname).toBe('Alice');

      const cookieDevice2 = pairBob.headers['set-cookie'];
      const tokenDevice2 = extractSessionToken(cookieDevice2);
      expect(tokenDevice2).toBeTruthy();

      // Step 3: Device 1 (Alice on phone) creates device link OTP
      const createOtp = await request(app)
        .post('/api/auth/device-link/create')
        .set('Cookie', cookieDevice1)
        .send();

      expect(createOtp.status).toBe(200);
      expect(createOtp.body.code).toMatch(/^\d{6}$/);
      expect(createOtp.body.expiresAt).toBeDefined();
      expect(createOtp.body.qrUrl).toContain(`/link?code=${createOtp.body.code}`);

      const otpCode = createOtp.body.code;

      // Step 4: Device 3 (Alice on laptop) verifies OTP to get a new session
      const verifyOtp = await request(app)
        .post('/api/auth/device-link/verify')
        .send({ code: otpCode });

      expect(verifyOtp.status).toBe(200);
      expect(verifyOtp.headers['set-cookie']).toBeDefined();

      const cookieDevice3 = verifyOtp.headers['set-cookie'];
      const tokenDevice3 = extractSessionToken(cookieDevice3);
      expect(tokenDevice3).toBeTruthy();

      // Step 5: Verify Device 3 is logged in as Alice (slot 1)
      expect(verifyOtp.body.user.nickname).toBe('Alice');
      expect(verifyOtp.body.user.slot).toBe(1);
      expect(verifyOtp.body.user.id).toBe(pairAlice.body.user.id);
      expect(verifyOtp.body.couple.code).toBe('COUPLE-MULTI');
      expect(verifyOtp.body.partner.nickname).toBe('Bob');

      // Verify Device 3 session is valid and returns Alice's data
      const sessionDevice3 = await request(app)
        .get('/api/auth/session')
        .set('Cookie', cookieDevice3);

      expect(sessionDevice3.status).toBe(200);
      expect(sessionDevice3.body.user.nickname).toBe('Alice');
      expect(sessionDevice3.body.partner.nickname).toBe('Bob');

      // Step 6: Device 3 posts mood { emoji: 'laptop', label: 'Busy' }
      const postMood = await request(app)
        .post('/api/mood')
        .set('Cookie', cookieDevice3)
        .send({ emoji: '💻', label: 'Busy', colorTheme: 'indigo' });

      expect(postMood.status).toBe(200);
      expect(postMood.body.mood.emoji).toBe('💻');
      expect(postMood.body.mood.label).toBe('Busy');

      // Step 7: Verify Device 1 (Alice's phone) and Device 2 (Bob's phone) both see this mood
      const moodDevice1 = await request(app)
        .get('/api/mood')
        .set('Cookie', cookieDevice1);

      expect(moodDevice1.status).toBe(200);
      // Device 1 is Alice, so this mood shows as "myMood" (same user posted it)
      expect(moodDevice1.body.myMood).toBeDefined();
      expect(moodDevice1.body.myMood.emoji).toBe('💻');
      expect(moodDevice1.body.myMood.label).toBe('Busy');

      const moodDevice2 = await request(app)
        .get('/api/mood')
        .set('Cookie', cookieDevice2);

      expect(moodDevice2.status).toBe(200);
      // Device 2 is Bob, so Alice's mood shows as "partnerMood"
      expect(moodDevice2.body.partnerMood).toBeDefined();
      expect(moodDevice2.body.partnerMood.emoji).toBe('💻');
      expect(moodDevice2.body.partnerMood.label).toBe('Busy');

      // Step 8: Device 3 logs out (individual device logout)
      const logoutDevice3 = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookieDevice3);

      expect(logoutDevice3.status).toBe(200);
      expect(logoutDevice3.body.message).toBe('Logged out from this device');

      // Verify cookie is cleared
      const logoutCookieRaw = Array.isArray(logoutDevice3.headers['set-cookie'])
        ? logoutDevice3.headers['set-cookie'].join('; ')
        : logoutDevice3.headers['set-cookie'];
      expect(logoutCookieRaw).toContain('Max-Age=0');

      // Step 9: Verify Device 3 is logged out
      const sessionDevice3After = await request(app)
        .get('/api/auth/session')
        .set('Cookie', cookieDevice3);

      expect(sessionDevice3After.status).toBe(401);

      // Verify Device 3 session token is deleted from DB
      expect(await getSession(tokenDevice3)).toBeNull();

      // Verify Device 1 (Alice's phone) remains fully authenticated
      const sessionDevice1 = await request(app)
        .get('/api/auth/session')
        .set('Cookie', cookieDevice1);

      expect(sessionDevice1.status).toBe(200);
      expect(sessionDevice1.body.user.nickname).toBe('Alice');

      // Verify Device 2 (Bob's phone) remains fully authenticated
      const sessionDevice2 = await request(app)
        .get('/api/auth/session')
        .set('Cookie', cookieDevice2);

      expect(sessionDevice2.status).toBe(200);
      expect(sessionDevice2.body.user.nickname).toBe('Bob');

      // Step 10: Device 1 calls POST /api/auth/unpair
      const unpairDevice1 = await request(app)
        .post('/api/auth/unpair')
        .set('Cookie', cookieDevice1);

      expect(unpairDevice1.status).toBe(200);

      // Step 11: Verify Device 1 session is deleted
      expect(await getSession(tokenDevice1)).toBeNull();

      const sessionDevice1After = await request(app)
        .get('/api/auth/session')
        .set('Cookie', cookieDevice1);

      expect(sessionDevice1After.status).toBe(401);
    });
  });

  describe('OTP Error Handling', () => {
    it('rejects invalid OTP code with 404', async () => {
      const res = await request(app)
        .post('/api/auth/device-link/verify')
        .send({ code: '000000' });

      expect(res.status).toBe(404);
    });

    it('rejects non-6-digit code with 400', async () => {
      const res = await request(app)
        .post('/api/auth/device-link/verify')
        .send({ code: '12345' });

      expect(res.status).toBe(400);
    });

    it('rejects expired OTP with 410', async () => {
      // Pair Alice to get a session
      const pairAlice = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'EXPIRE-TEST', nickname: 'Alice' });

      const cookieAlice = pairAlice.headers['set-cookie'];

      // Create OTP
      const createOtp = await request(app)
        .post('/api/auth/device-link/create')
        .set('Cookie', cookieAlice)
        .send();

      const otpCode = createOtp.body.code;

      // Manually expire the OTP by updating the store
      const { getDb } = await import('../server/src/db.js');
      const redis = getDb();
      const otp = await redis.get<any>(`otps:${otpCode}`);
      if (otp) {
        otp.expires_at = new Date(Date.now() - 60000).toISOString();
        await redis.set(`otps:${otpCode}`, otp);
      }

      // Attempt to verify expired OTP
      const res = await request(app)
        .post('/api/auth/device-link/verify')
        .send({ code: otpCode });

      expect(res.status).toBe(410);
    });

    it('locks out after 5 failed attempts with 429', async () => {
      // Pair Alice to get a session
      const pairAlice = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'LOCKOUT-TEST', nickname: 'Alice' });

      const cookieAlice = pairAlice.headers['set-cookie'];

      // Create OTP
      const createOtp = await request(app)
        .post('/api/auth/device-link/create')
        .set('Cookie', cookieAlice)
        .send();

      expect(createOtp.body.code).toMatch(/^\d{6}$/);

      // Manually set failed_attempts to 5 in the store
      const { getDb } = await import('../server/src/db.js');
      const redis = getDb();
      const otp = await redis.get<any>(`otps:${createOtp.body.code}`);
      if (otp) {
        otp.failed_attempts = 5;
        await redis.set(`otps:${createOtp.body.code}`, otp);
      }

      // Attempt to verify should return 429
      const res = await request(app)
        .post('/api/auth/device-link/verify')
        .send({ code: createOtp.body.code });

      expect(res.status).toBe(429);
    });

    it('OTP is single-use: second verification fails with 404', async () => {
      // Pair Alice
      const pairAlice = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'SINGLE-USE', nickname: 'Alice' });

      const cookieAlice = pairAlice.headers['set-cookie'];

      // Create and verify OTP
      const createOtp = await request(app)
        .post('/api/auth/device-link/create')
        .set('Cookie', cookieAlice)
        .send();

      const otpCode = createOtp.body.code;

      // First verification succeeds
      const firstVerify = await request(app)
        .post('/api/auth/device-link/verify')
        .send({ code: otpCode });

      expect(firstVerify.status).toBe(200);

      // Second verification fails (OTP was deleted after first use)
      const secondVerify = await request(app)
        .post('/api/auth/device-link/verify')
        .send({ code: otpCode });

      expect(secondVerify.status).toBe(404);
    });

    it('requires authentication to create device link OTP', async () => {
      const res = await request(app)
        .post('/api/auth/device-link/create')
        .send();

      expect(res.status).toBe(401);
    });
  });

  describe('Multi-Device SSE Sync', () => {
    it('broadcasts mood update to both partner and same-user devices via SSE', async () => {
      // Pair Alice & Bob
      const pairA = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'SSE-MULTI', nickname: 'Alice' });
      const pairB = await request(app)
        .post('/api/auth/pair')
        .send({ code: 'SSE-MULTI', nickname: 'Bob' });

      const cookieA = (pairA.headers['set-cookie'] as unknown as string[])[0];
      const cookieB = (pairB.headers['set-cookie'] as unknown as string[])[0];

      // Create device link for Alice (second device)
      const createOtp = await request(app)
        .post('/api/auth/device-link/create')
        .set('Cookie', cookieA)
        .send();

      const verifyOtp = await request(app)
        .post('/api/auth/device-link/verify')
        .send({ code: createOtp.body.code });

      const cookieA2 = (verifyOtp.headers['set-cookie'] as unknown as string[])[0];

      // Bind ephemeral HTTP server for SSE testing
      const server = app.listen(0);
      const port = (server.address() as any).port;
      const controllerB = new AbortController();
      const controllerA2 = new AbortController();

      try {
        // Bob opens SSE stream
        const responseB = await fetch(`http://127.0.0.1:${port}/api/stream`, {
          headers: { Cookie: cookieB },
          signal: controllerB.signal
        });
        expect(responseB.status).toBe(200);

        const readerB = responseB.body?.getReader();
        const decoder = new TextDecoder();

        // Read initial connection ping for Bob
        const bobPing = await readerB?.read();
        expect(decoder.decode(bobPing?.value)).toContain(': connected');

        // Alice's second device opens SSE stream
        const responseA2 = await fetch(`http://127.0.0.1:${port}/api/stream`, {
          headers: { Cookie: cookieA2 },
          signal: controllerA2.signal
        });
        expect(responseA2.status).toBe(200);

        const readerA2 = responseA2.body?.getReader();

        // Read initial connection ping for Alice's second device
        const a2Ping = await readerA2?.read();
        expect(decoder.decode(a2Ping?.value)).toContain(': connected');

        // Alice's first device posts mood
        await request(app)
          .post('/api/mood')
          .set('Cookie', cookieA)
          .send({ emoji: '☕', label: 'Cozy', colorTheme: 'amber' });

        // Bob receives mood_update event as partner
        const bobMoodChunk = await readerB?.read();
        const bobMoodText = decoder.decode(bobMoodChunk?.value);
        expect(bobMoodText).toContain('event: mood_update');
        expect(bobMoodText).toContain('Cozy');

        // Alice's second device also receives mood_update event (own-user sync)
        const a2MoodChunk = await readerA2?.read();
        const a2MoodText = decoder.decode(a2MoodChunk?.value);
        expect(a2MoodText).toContain('event: mood_update');
        expect(a2MoodText).toContain('Cozy');
      } finally {
        controllerB.abort();
        controllerA2.abort();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
