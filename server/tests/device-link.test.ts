import { describe, it, expect, beforeEach } from 'vitest';
import {
  initDb,
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
