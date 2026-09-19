import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDb,
  closeDb,
  getVapidKeys,
  pairUser,
  getSession,
  deleteSession,
  getMood,
  setMood,
  deleteMood,
  getUserPresets,
  setUserPresets,
  createDeviceLinkOtp,
  verifyDeviceLinkOtp,
  checkRoomJoinLockout,
  recordRoomJoinFailedAttempt,
  resetRoomJoinFailedAttempts
} from '../src/db.js';

describe('Redis Database Layer & Operations', () => {
  beforeEach(() => {
    initDb(':memory:');
  });

  afterEach(() => {
    closeDb();
  });

  describe('Database Initialization & Store', () => {
    it('initializes and resets the store cleanly', () => {
      const store = initDb(':memory:');
      expect(store).toBeDefined();
    });
  });

  describe('VAPID Key Generation & Persistence', () => {
    it('auto-generates and persists VAPID keys', async () => {
      const keys = await getVapidKeys();

      expect(keys).toBeDefined();
      expect(typeof keys.publicKey).toBe('string');
      expect(typeof keys.privateKey).toBe('string');
      expect(keys.publicKey.length).toBeGreaterThan(20);
      expect(keys.privateKey.length).toBeGreaterThan(20);

      // Subsequent calls should retrieve the exact same persisted keys
      const keysSecondCall = await getVapidKeys();
      expect(keysSecondCall.publicKey).toBe(keys.publicKey);
      expect(keysSecondCall.privateKey).toBe(keys.privateKey);
    });
  });

  describe('User Pairing Logic', () => {
    it('creates couple and assigns slot 1 for the first user', async () => {
      const result = await pairUser('LOVE-4242', 'Alice');

      expect(result.couple).toBeDefined();
      expect(result.couple.code).toBe('LOVE-4242');
      expect(result.user).toBeDefined();
      expect(result.user.nickname).toBe('Alice');
      expect(result.user.slot).toBe(1);
      expect(result.user.couple_id).toBe(result.couple.id);
      expect(result.partner).toBeNull();
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBe(64);
    });

    it('normalizes couple code by trimming whitespace and converting to uppercase', async () => {
      const result = await pairUser('  love-8888  ', 'Alice');
      expect(result.couple.code).toBe('LOVE-8888');
    });

    it('joins existing couple with slot 2 and identifies slot 1 as partner', async () => {
      const user1 = await pairUser('COZY-1234', 'Alice');
      const user2 = await pairUser('COZY-1234', 'Bob');

      expect(user2.couple.id).toBe(user1.couple.id);
      expect(user2.couple.code).toBe('COZY-1234');
      expect(user2.user.nickname).toBe('Bob');
      expect(user2.user.slot).toBe(2);
      expect(user2.partner).toBeDefined();
      expect(user2.partner?.id).toBe(user1.user.id);
      expect(user2.partner?.nickname).toBe('Alice');
      expect(user2.partner?.slot).toBe(1);
    });

    it('allows member to rejoin 1-person room with same nickname (case-insensitive) without taking slot 2', async () => {
      const u1 = await pairUser('REJOIN-1', 'Alice');
      const u1_rejoin = await pairUser('REJOIN-1', 'alice');

      expect(u1_rejoin.user.id).toBe(u1.user.id);
      expect(u1_rejoin.user.slot).toBe(1);
      expect(u1_rejoin.partner).toBeNull();
      expect(u1_rejoin.token).not.toBe(u1.token);

      // Both sessions remain active
      expect(await getSession(u1.token)).not.toBeNull();
      expect(await getSession(u1_rejoin.token)).not.toBeNull();

      // Partner can still join slot 2
      const u2 = await pairUser('REJOIN-1', 'Bob');
      expect(u2.user.slot).toBe(2);
      expect(u2.partner?.id).toBe(u1.user.id);
    });

    it('allows both members to rejoin a full room with their existing nicknames (case-insensitive)', async () => {
      const u1 = await pairUser('REJOIN-2', 'Emma');
      const u2 = await pairUser('REJOIN-2', 'Liam');

      // Emma rejoins
      const emmaRejoin = await pairUser('REJOIN-2', 'EMMA');
      expect(emmaRejoin.user.id).toBe(u1.user.id);
      expect(emmaRejoin.partner?.id).toBe(u2.user.id);
      expect(emmaRejoin.partner?.nickname).toBe('Liam');

      // Liam rejoins
      const liamRejoin = await pairUser('REJOIN-2', 'liam');
      expect(liamRejoin.user.id).toBe(u2.user.id);
      expect(liamRejoin.partner?.id).toBe(u1.user.id);
      expect(liamRejoin.partner?.nickname).toBe('Emma');
    });

    it('rejects a 3rd user attempting to join a full couple with "Couple code is full"', async () => {
      await pairUser('FULL-9999', 'Alice');
      await pairUser('FULL-9999', 'Bob');

      await expect(pairUser('FULL-9999', 'Charlie')).rejects.toThrow(/Couple code is full/i);
    });

    it('rejects invalid or empty code and nickname', async () => {
      await expect(pairUser('', 'Alice')).rejects.toThrow();
      await expect(pairUser('VALID', '')).rejects.toThrow();
      await expect(pairUser('   ', 'Bob')).rejects.toThrow();
    });
  });

  describe('Room Join Attempt Lockout', () => {
    it('tracks failed join attempts per IP and room code, locking out after 5 failures and resetting on success', async () => {
      const ip = '192.168.1.50';
      const code = 'TEST-LOCK';

      expect((await checkRoomJoinLockout(ip, code)).locked).toBe(false);

      // Record 4 failed attempts
      for (let i = 1; i <= 4; i++) {
        const res = await recordRoomJoinFailedAttempt(ip, code);
        expect(res.locked).toBe(false);
        expect(res.attemptsLeft).toBe(5 - i);
      }

      // 5th attempt locks out
      const res5 = await recordRoomJoinFailedAttempt(ip, code);
      expect(res5.locked).toBe(true);
      expect(res5.waitSeconds).toBeGreaterThan(0);

      // Check lockout status
      expect((await checkRoomJoinLockout(ip, code)).locked).toBe(true);

      // Reset
      await resetRoomJoinFailedAttempts(ip, code);
      expect((await checkRoomJoinLockout(ip, code)).locked).toBe(false);
    });
  });

  describe('Session Management', () => {
    it('persists session and retrieves user, couple, and partner via getSession', async () => {
      const u1 = await pairUser('PAIR-7777', 'Alice');
      const u2 = await pairUser('PAIR-7777', 'Bob');

      const session1 = await getSession(u1.token);
      expect(session1).not.toBeNull();
      expect(session1?.user.id).toBe(u1.user.id);
      expect(session1?.user.nickname).toBe('Alice');
      expect(session1?.user.slot).toBe(1);
      expect(session1?.couple.id).toBe(u1.couple.id);
      expect(session1?.partner?.id).toBe(u2.user.id);
      expect(session1?.partner?.nickname).toBe('Bob');

      const session2 = await getSession(u2.token);
      expect(session2).not.toBeNull();
      expect(session2?.partner?.id).toBe(u1.user.id);
      expect(session2?.partner?.nickname).toBe('Alice');
    });

    it('returns null for nonexistent session token', async () => {
      const session = await getSession('non-existent-token');
      expect(session).toBeNull();
    });

    it('deletes session on deleteSession', async () => {
      const u = await pairUser('DEL-1111', 'Alice');
      expect(await getSession(u.token)).not.toBeNull();

      await deleteSession(u.token);
      expect(await getSession(u.token)).toBeNull();
    });
  });

  describe('Mood, Presets & Device Linking', () => {
    it('sets, gets, and deletes moods', async () => {
      const u = await pairUser('MOOD-1', 'Alice');
      expect(await getMood(u.user.id)).toBeNull();

      const mood = await setMood(u.user.id, '🥰', 'In Love', 'Feeling great');
      expect(mood.emoji).toBe('🥰');

      const fetched = await getMood(u.user.id);
      expect(fetched?.label).toBe('In Love');

      await deleteMood(u.user.id);
      expect(await getMood(u.user.id)).toBeNull();
    });

    it('manages custom presets and defaults', async () => {
      const u = await pairUser('PRESET-1', 'Alice');
      const presets = await getUserPresets(u.user.id, 'en');
      expect(presets.length).toBe(7);
      expect(presets[0].label).toBe('Missing you');

      const updated = await setUserPresets(u.user.id, [
        { emoji: '🚀', label: 'Energized', color_theme: 'emerald', sort_order: 0 }
      ]);
      expect(updated.length).toBe(1);
      expect(updated[0].label).toBe('Energized');
    });

    it('creates and verifies device link OTP', async () => {
      const u = await pairUser('OTP-1', 'Alice');
      const otp = await createDeviceLinkOtp(u.user.id);
      expect(otp.code).toMatch(/^\d{6}$/);

      const verified = await verifyDeviceLinkOtp(otp.code);
      expect(verified.user.id).toBe(u.user.id);
      expect(verified.token).toBeDefined();
    });
  });
});
