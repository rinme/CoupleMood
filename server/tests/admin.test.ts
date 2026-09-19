import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  initDb,
  closeDb,
  pairUser,
  verifyAdminPassword,
  checkAdminLockout,
  recordAdminFailedAttempt,
  resetAdminFailedAttempts,
  createAdminSession,
  verifyAdminSession,
  deleteAdminSession,
  getAllSessionsWithDetails,
  getAdminStats,
  revokeSession,
  revokeSessionsByCouple,
  revokeAllSessions,
  getAllCouplesWithDetails,
  deleteCouple
} from '../src/db.js';
import { parseUserAgent } from '../src/device.js';
import { addConnection } from '../src/sse.js';

describe('Admin Subsystem & Device Tracking', () => {
  beforeEach(() => {
    initDb(':memory:');
    process.env.ADMIN_PASSWORD = 'supersecretpass';
  });

  afterEach(() => {
    closeDb();
    delete process.env.ADMIN_PASSWORD;
  });

  describe('User-Agent Parsing', () => {
    it('parses iOS Safari correctly', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      expect(parseUserAgent(ua)).toBe('iPhone · Safari');
    });

    it('parses Android Chrome correctly', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36';
      expect(parseUserAgent(ua)).toBe('Android · Chrome');
    });

    it('parses macOS Chrome correctly', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
      expect(parseUserAgent(ua)).toBe('macOS · Chrome');
    });

    it('parses Windows Edge correctly', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
      expect(parseUserAgent(ua)).toBe('Windows · Edge');
    });

    it('handles empty or missing user-agents gracefully', () => {
      expect(parseUserAgent(undefined)).toBe('Unknown Device');
      expect(parseUserAgent('')).toBe('Unknown Device');
      expect(parseUserAgent('   ')).toBe('Unknown Device');
    });
  });

  describe('Admin Database Layer', () => {
    it('verifies admin password correctly and rejects wrong password', () => {
      expect(verifyAdminPassword('supersecretpass')).toBe(true);
      expect(verifyAdminPassword('wrongpass')).toBe(false);
      expect(verifyAdminPassword('')).toBe(false);
    });

    it('enforces brute-force lockout after 5 consecutive failed attempts', async () => {
      const testIp = '192.168.1.50';

      // 4 failures: not locked
      for (let i = 1; i <= 4; i++) {
        const res = await recordAdminFailedAttempt(testIp);
        expect(res.locked).toBe(false);
        expect(res.attemptsLeft).toBe(5 - i);
      }

      // 5th failure triggers 15 min lockout
      const fifth = await recordAdminFailedAttempt(testIp);
      expect(fifth.locked).toBe(true);
      expect(fifth.waitSeconds).toBeGreaterThan(800);

      // Subsequent check confirms lockout
      const status = await checkAdminLockout(testIp);
      expect(status.locked).toBe(true);

      // Reset unlocks
      await resetAdminFailedAttempts(testIp);
      const afterReset = await checkAdminLockout(testIp);
      expect(afterReset.locked).toBe(false);
    });

    it('manages admin session lifecycle (create, verify, delete)', async () => {
      const token = await createAdminSession();
      expect(token).toBeDefined();
      expect(token.length).toBe(64);

      expect(await verifyAdminSession(token)).toBe(true);
      expect(await verifyAdminSession('nonexistent-token')).toBe(false);

      await deleteAdminSession(token);
      expect(await verifyAdminSession(token)).toBe(false);
    });

    it('stores user-agent and device_info on pairUser and tracks online status', async () => {
      const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
      const pair = await pairUser('TEST01', 'Alice', userAgent);

      const sessions = await getAllSessionsWithDetails();
      expect(sessions.length).toBe(1);
      expect(sessions[0].user_nickname).toBe('Alice');
      expect(sessions[0].couple_code).toBe('TEST01');
      expect(sessions[0].device_info).toBe('iPhone · Safari');
      expect(sessions[0].is_online).toBe(false);

      // Simulate active SSE connection for this token
      const mockRes: any = {
        write: () => true,
        end: () => true,
        on: () => {},
        destroyed: false,
        writableEnded: false
      };
      const cleanup = addConnection(pair.user.id, mockRes, pair.token);

      const onlineSessions = await getAllSessionsWithDetails();
      expect(onlineSessions[0].is_online).toBe(true);

      cleanup();
      const offlineSessions = await getAllSessionsWithDetails();
      expect(offlineSessions[0].is_online).toBe(false);
    });

    it('provides accurate admin statistics', async () => {
      await pairUser('PAIR1', 'User1');
      await pairUser('PAIR2', 'User2');

      const stats = await getAdminStats();
      expect(stats.total_couples).toBe(2);
      expect(stats.total_users).toBe(2);
      expect(stats.total_sessions).toBe(2);
      expect(stats.live_connections).toBe(0);
    });

    it('revokes individual session, couple sessions, and all sessions', async () => {
      const pairA = await pairUser('ROOM1', 'UserA');
      const pairB = await pairUser('ROOM2', 'UserB');

      expect((await getAllSessionsWithDetails()).length).toBe(2);

      // Revoke single session
      const revoked = await revokeSession(pairA.token);
      expect(revoked).toBe(true);
      expect((await getAllSessionsWithDetails()).length).toBe(1);

      // Add another session for room2
      await pairUser('ROOM2', 'UserC');
      expect((await getAllSessionsWithDetails()).length).toBe(2);

      // Revoke all sessions for room2
      const coupleRevoked = await revokeSessionsByCouple(pairB.couple.id);
      expect(coupleRevoked).toBe(2);
      expect((await getAllSessionsWithDetails()).length).toBe(0);

      // Revoke all
      await pairUser('ROOM3', 'UserD');
      expect((await getAllSessionsWithDetails()).length).toBe(1);
      const allRevoked = await revokeAllSessions();
      expect(allRevoked).toBe(1);
      expect((await getAllSessionsWithDetails()).length).toBe(0);
    });
  });

  describe('Admin API Endpoints', () => {
    it('returns 401 on protected admin endpoints without cookie', async () => {
      const app = createApp();

      const checkRes = await request(app).get('/api/admin/check');
      expect(checkRes.status).toBe(401);

      const statsRes = await request(app).get('/api/admin/stats');
      expect(statsRes.status).toBe(401);

      const sessionsRes = await request(app).get('/api/admin/sessions');
      expect(sessionsRes.status).toBe(401);
    });

    it('logs in successfully and allows access to protected endpoints', async () => {
      const app = createApp();

      const loginRes = await request(app)
        .post('/api/admin/login')
        .send({ password: 'supersecretpass' });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);

      const cookies = loginRes.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const adminCookie = cookies.find((c: string) => c.startsWith('admin_session='));
      expect(adminCookie).toBeDefined();

      // Check session
      const checkRes = await request(app)
        .get('/api/admin/check')
        .set('Cookie', adminCookie);
      expect(checkRes.status).toBe(200);
      expect(checkRes.body.authenticated).toBe(true);

      // Get stats
      const statsRes = await request(app)
        .get('/api/admin/stats')
        .set('Cookie', adminCookie);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.total_couples).toBe(0);

      // Get sessions
      const sessionsRes = await request(app)
        .get('/api/admin/sessions')
        .set('Cookie', adminCookie);
      expect(sessionsRes.status).toBe(200);
      expect(sessionsRes.body.sessions).toBeInstanceOf(Array);

      // Get couples
      const couplesRes = await request(app)
        .get('/api/admin/couples')
        .set('Cookie', adminCookie);
      expect(couplesRes.status).toBe(200);
      expect(couplesRes.body.couples).toBeInstanceOf(Array);

      // Logout
      const logoutRes = await request(app)
        .post('/api/admin/logout')
        .set('Cookie', adminCookie);
      expect(logoutRes.status).toBe(200);

      // Check after logout -> 401
      const checkAfter = await request(app).get('/api/admin/check');
      expect(checkAfter.status).toBe(401);
    });

    it('returns 401 with attemptsLeft on invalid password and locks out after 5 failures', async () => {
      const app = createApp();

      for (let i = 1; i <= 4; i++) {
        const res = await request(app)
          .post('/api/admin/login')
          .send({ password: 'wrongpassword' });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Incorrect password');
        expect(res.body.attemptsLeft).toBe(5 - i);
      }

      // 5th failure -> 429 lockout
      const fifthRes = await request(app)
        .post('/api/admin/login')
        .send({ password: 'wrongpassword' });

      expect(fifthRes.status).toBe(429);
      expect(fifthRes.body.locked).toBe(true);
      expect(fifthRes.body.waitSeconds).toBeGreaterThan(800);
    });

    it('revokes session via DELETE /api/admin/sessions/:token', async () => {
      const app = createApp();

      // Create a couple session
      const pair = await pairUser('DEMO1', 'Bob');

      // Login as admin
      const loginRes = await request(app)
        .post('/api/admin/login')
        .send({ password: 'supersecretpass' });
      const adminCookie = loginRes.headers['set-cookie'].find((c: string) => c.startsWith('admin_session='));

      // Check sessions
      const listRes = await request(app)
        .get('/api/admin/sessions')
        .set('Cookie', adminCookie);
      expect(listRes.status).toBe(200);
      expect(listRes.body.sessions.length).toBe(1);

      // Revoke session
      const deleteRes = await request(app)
        .delete(`/api/admin/sessions/${pair.token}`)
        .set('Cookie', adminCookie);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // Verify list is now empty
      const listAfter = await request(app)
        .get('/api/admin/sessions')
        .set('Cookie', adminCookie);
      expect(listAfter.body.sessions.length).toBe(0);
    });

    it('lists couples and deletes couple room via DELETE /api/admin/couples/:coupleId', async () => {
      const app = createApp();

      // Pair a couple with 2 members
      const pair1 = await pairUser('ROOMX', 'Emma');
      await pairUser('ROOMX', 'Noah');

      // Login as admin
      const loginRes = await request(app)
        .post('/api/admin/login')
        .send({ password: 'supersecretpass' });
      const adminCookie = loginRes.headers['set-cookie'].find((c: string) => c.startsWith('admin_session='));

      // GET /api/admin/couples
      const couplesRes = await request(app)
        .get('/api/admin/couples')
        .set('Cookie', adminCookie);
      expect(couplesRes.status).toBe(200);
      expect(couplesRes.body.couples.length).toBe(1);
      expect(couplesRes.body.couples[0].code).toBe('ROOMX');
      expect(couplesRes.body.couples[0].members.length).toBe(2);
      expect(couplesRes.body.couples[0].members[0].nickname).toBe('Emma');
      expect(couplesRes.body.couples[0].members[1].nickname).toBe('Noah');
      expect(couplesRes.body.couples[0].active_sessions_count).toBe(2);

      // DELETE /api/admin/couples/:coupleId
      const deleteCoupleRes = await request(app)
        .delete(`/api/admin/couples/${pair1.couple.id}`)
        .set('Cookie', adminCookie);
      expect(deleteCoupleRes.status).toBe(200);
      expect(deleteCoupleRes.body.success).toBe(true);
      expect(deleteCoupleRes.body.coupleId).toBe(pair1.couple.id);

      // Verify couples and sessions are now empty
      const couplesAfter = await request(app)
        .get('/api/admin/couples')
        .set('Cookie', adminCookie);
      expect(couplesAfter.body.couples.length).toBe(0);

      const sessionsAfter = await request(app)
        .get('/api/admin/sessions')
        .set('Cookie', adminCookie);
      expect(sessionsAfter.body.sessions.length).toBe(0);
    });
  });
});
