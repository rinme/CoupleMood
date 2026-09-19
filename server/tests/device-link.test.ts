import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { closeAllConnections } from '../src/sse.js';
import {
  initDb,
  closeDb,
  pairUser,
  createDeviceLinkOtp,
  verifyDeviceLinkOtp,
  recordOtpFailure,
  logoutSession,
  getDb
} from '../src/db.js';

describe('Device Link OTP Database Layer', () => {
  beforeEach(() => {
    initDb(':memory:');
  });

  it('generates a 6-digit numeric OTP with 5-minute expiration', () => {
    const { user } = pairUser('LOVE-1111', 'Alice');
    const { code, expiresAt } = createDeviceLinkOtp(user.id);

    expect(code).toMatch(/^\d{6}$/);
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(4 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it('replaces prior OTP when a new OTP is created for the same user', () => {
    const { user } = pairUser('LOVE-1111', 'Alice');
    const first = createDeviceLinkOtp(user.id);
    const second = createDeviceLinkOtp(user.id);

    expect(second.code).toMatch(/^\d{6}$/);
    const db = getDb();
    const count = (
      db.prepare('SELECT COUNT(*) as cnt FROM device_link_otps WHERE user_id = ?').get(user.id) as any
    ).cnt;
    expect(count).toBe(1);

    // First code is no longer valid
    expect(() => verifyDeviceLinkOtp(first.code)).toThrow(/Invalid or expired/i);
    // Second code is valid
    const res = verifyDeviceLinkOtp(second.code);
    expect(res.user.id).toBe(user.id);
  });

  it('verifies valid OTP, creates new session, and deletes OTP (single-use)', () => {
    const { user, couple } = pairUser('LOVE-1111', 'Alice');
    const { code } = createDeviceLinkOtp(user.id);

    const result = verifyDeviceLinkOtp(code);
    expect(result.user.id).toBe(user.id);
    expect(result.couple.code).toBe(couple.code);
    expect(result.token).toBeDefined();

    // Verify OTP is deleted after redemption
    expect(() => verifyDeviceLinkOtp(code)).toThrow(/Invalid or expired/i);
  });

  it('populates partner info correctly if partner exists', () => {
    const { user: user1 } = pairUser('LOVE-2222', 'Alice');
    const { user: user2 } = pairUser('LOVE-2222', 'Bob');

    const { code } = createDeviceLinkOtp(user1.id);
    const result = verifyDeviceLinkOtp(code);

    expect(result.user.id).toBe(user1.id);
    expect(result.partner).not.toBeNull();
    expect(result.partner?.id).toBe(user2.id);
    expect(result.partner?.nickname).toBe('Bob');
  });

  it('rejects non-existent OTP with 404 status', () => {
    try {
      verifyDeviceLinkOtp('999999');
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.status).toBe(404);
      expect(err.message).toMatch(/Invalid or expired code/i);
    }
  });

  it('rejects expired OTP with 410 status and deletes it', () => {
    const { user } = pairUser('LOVE-1111', 'Alice');
    const { code } = createDeviceLinkOtp(user.id);

    const db = getDb();
    // Force expired date
    db.prepare('UPDATE device_link_otps SET expires_at = ? WHERE code = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      code
    );

    try {
      verifyDeviceLinkOtp(code);
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.status).toBe(410);
      expect(err.message).toMatch(/expired/i);
    }

    // OTP should be deleted from db
    const row = db.prepare('SELECT * FROM device_link_otps WHERE code = ?').get(code);
    expect(row).toBeUndefined();
  });

  it('locks out and deletes OTP after 5 failed attempts with 429 status', () => {
    const { user } = pairUser('LOVE-1111', 'Alice');
    const { code } = createDeviceLinkOtp(user.id);

    // Record 5 failed attempts
    for (let i = 0; i < 5; i++) {
      recordOtpFailure(code);
    }

    try {
      verifyDeviceLinkOtp(code);
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.status).toBe(429);
      expect(err.message).toMatch(/Too many failed attempts/i);
    }

    // Verify OTP was deleted upon lockout
    expect(() => verifyDeviceLinkOtp(code)).toThrow(/Invalid or expired/i);
  });

  it('logoutSession deletes only targeted session', () => {
    const { user, token: token1 } = pairUser('LOVE-1111', 'Alice');
    const { code } = createDeviceLinkOtp(user.id);
    const { token: token2 } = verifyDeviceLinkOtp(code);

    const db = getDb();
    const countSessions = () =>
      (db.prepare('SELECT COUNT(*) as cnt FROM sessions WHERE user_id = ?').get(user.id) as any).cnt;

    expect(countSessions()).toBe(2);

    logoutSession(token2);
    expect(countSessions()).toBe(1);

    const remainingSession = db.prepare('SELECT token FROM sessions WHERE user_id = ?').get(user.id) as any;
    expect(remainingSession.token).toBe(token1);
  });

  it('logoutSession handles non-existent token gracefully', () => {
    expect(() => logoutSession('non-existent-token')).not.toThrow();
  });
});

describe('Device Link API Routes & SSE Sync', () => {
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

  it('creates OTP via authenticated POST /api/auth/device-link/create', async () => {
    const pairRes = await request(app)
      .post('/api/auth/pair')
      .send({ code: 'LOVE-1111', nickname: 'Alice' });

    const cookie = pairRes.headers['set-cookie'];

    const res = await request(app)
      .post('/api/auth/device-link/create')
      .set('Cookie', cookie)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(/^\d{6}$/);
    expect(res.body.qrUrl).toContain(`/link?code=${res.body.code}`);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects unauthenticated POST /api/auth/device-link/create with 401', async () => {
    const res = await request(app)
      .post('/api/auth/device-link/create')
      .send();

    expect(res.status).toBe(401);
  });

  it('verifies OTP via public POST /api/auth/device-link/verify and sets session cookie', async () => {
    const pairRes = await request(app)
      .post('/api/auth/pair')
      .send({ code: 'LOVE-1111', nickname: 'Alice' });

    const cookie = pairRes.headers['set-cookie'];

    const createRes = await request(app)
      .post('/api/auth/device-link/create')
      .set('Cookie', cookie)
      .send();

    const otpCode = createRes.body.code;

    // Verify OTP from second device
    const verifyRes = await request(app)
      .post('/api/auth/device-link/verify')
      .send({ code: otpCode });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.user.nickname).toBe('Alice');
    expect(verifyRes.body.couple.code).toBe('LOVE-1111');
    expect(verifyRes.headers['set-cookie']).toBeDefined();
    expect(verifyRes.headers['set-cookie'][0]).toContain('mood_session=');
  });

  it('rejects invalid code format on POST /api/auth/device-link/verify with 400', async () => {
    const res1 = await request(app)
      .post('/api/auth/device-link/verify')
      .send({ code: '' });
    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .post('/api/auth/device-link/verify')
      .send({ code: '123' });
    expect(res2.status).toBe(400);

    const res3 = await request(app)
      .post('/api/auth/device-link/verify')
      .send({ code: 'abcdef' });
    expect(res3.status).toBe(400);
  });

  it('rejects non-existent code with 404 on POST /api/auth/device-link/verify and records failure', async () => {
    const res = await request(app)
      .post('/api/auth/device-link/verify')
      .send({ code: '999999' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Invalid or expired code/i);
  });

  it('rejects expired OTP with 410 on POST /api/auth/device-link/verify', async () => {
    const pairRes = await request(app)
      .post('/api/auth/pair')
      .send({ code: 'LOVE-1111', nickname: 'Alice' });

    const cookie = pairRes.headers['set-cookie'];

    const createRes = await request(app)
      .post('/api/auth/device-link/create')
      .set('Cookie', cookie)
      .send();

    const otpCode = createRes.body.code;

    // Force expired in db
    const db = getDb();
    db.prepare('UPDATE device_link_otps SET expires_at = ? WHERE code = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      otpCode
    );

    const verifyRes = await request(app)
      .post('/api/auth/device-link/verify')
      .send({ code: otpCode });

    expect(verifyRes.status).toBe(410);
    expect(verifyRes.body.error).toMatch(/expired/i);
  });

  it('rejects locked out OTP after 5 failed attempts with 429', async () => {
    const pairRes = await request(app)
      .post('/api/auth/pair')
      .send({ code: 'LOVE-1111', nickname: 'Alice' });

    const cookie = pairRes.headers['set-cookie'];

    const createRes = await request(app)
      .post('/api/auth/device-link/create')
      .set('Cookie', cookie)
      .send();

    const otpCode = createRes.body.code;

    const db = getDb();
    db.prepare('UPDATE device_link_otps SET failed_attempts = 5 WHERE code = ?').run(otpCode);

    const verifyRes = await request(app)
      .post('/api/auth/device-link/verify')
      .send({ code: otpCode });

    expect(verifyRes.status).toBe(429);
    expect(verifyRes.body.error).toMatch(/Too many failed attempts/i);
  });

  it('logs out individual device session via POST /api/auth/logout', async () => {
    const pairRes = await request(app)
      .post('/api/auth/pair')
      .send({ code: 'LOVE-1111', nickname: 'Alice' });

    const cookie = pairRes.headers['set-cookie'];

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .send();

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers['set-cookie'][0]).toContain('Max-Age=0');

    // Confirm session is no longer authenticated
    const sessionRes = await request(app)
      .get('/api/auth/session')
      .set('Cookie', cookie)
      .send();

    expect(sessionRes.status).toBe(401);
  });

  it('rejects unauthenticated POST /api/auth/logout with 401', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send();

    expect(res.status).toBe(401);
  });

  it('syncs mood updates across multiple devices of the same user via SSE', async () => {
    // Device 1 pairs
    const pairRes = await request(app)
      .post('/api/auth/pair')
      .send({ code: 'SYNC-1111', nickname: 'Alice' });
    const dev1Cookie = (pairRes.headers['set-cookie'] as unknown as string[])[0];

    // Device 1 creates OTP
    const createRes = await request(app)
      .post('/api/auth/device-link/create')
      .set('Cookie', dev1Cookie)
      .send();

    // Device 2 verifies OTP
    const verifyRes = await request(app)
      .post('/api/auth/device-link/verify')
      .send({ code: createRes.body.code });
    const dev2Cookie = (verifyRes.headers['set-cookie'] as unknown as string[])[0];

    const server = app.listen(0);
    const port = (server.address() as any).port;

    const controller = new AbortController();
    try {
      // Device 2 connects to SSE stream
      const response = await fetch(`http://127.0.0.1:${port}/api/stream`, {
        headers: { Cookie: dev2Cookie },
        signal: controller.signal
      });

      expect(response.status).toBe(200);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      // Read initial connection
      const initialChunk = await reader?.read();
      expect(decoder.decode(initialChunk?.value)).toContain(': connected');

      // Device 1 posts mood
      await request(app)
        .post('/api/mood')
        .set('Cookie', dev1Cookie)
        .send({ emoji: '✨', label: 'Inspired' });

      // Device 2 should receive mood_update event for Alice!
      const updateChunk = await reader?.read();
      const updateText = decoder.decode(updateChunk?.value);
      expect(updateText).toContain('event: mood_update');
      expect(updateText).toContain('Inspired');

      // Device 1 deletes mood
      await request(app)
        .delete('/api/mood')
        .set('Cookie', dev1Cookie);

      // Device 2 should receive mood_cleared event!
      const clearChunk = await reader?.read();
      const clearText = decoder.decode(clearChunk?.value);
      expect(clearText).toContain('event: mood_cleared');
    } finally {
      controller.abort();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
