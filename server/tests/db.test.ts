import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDb,
  getDb,
  closeDb,
  getVapidKeys,
  pairUser,
  getSession,
  deleteSession,
  checkRoomJoinLockout,
  recordRoomJoinFailedAttempt,
  resetRoomJoinFailedAttempts
} from '../src/db.js';
import type { Database as DatabaseType } from 'better-sqlite3';

describe('Database Schema, VAPID & Pairing Operations', () => {
  let db: DatabaseType;

  beforeEach(() => {
    // Initialize in-memory database for clean test isolation
    db = initDb(':memory:');
  });

  afterEach(() => {
    closeDb();
  });

  describe('Database Initialization & Schema', () => {
    it('creates all required tables', () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('couples');
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('sessions');
      expect(tableNames).toContain('moods');
      expect(tableNames).toContain('push_subscriptions');
      expect(tableNames).toContain('server_settings');
    });

    it('enables foreign key enforcement', () => {
      const fkPragma = db.pragma('foreign_keys', { simple: true });
      expect(fkPragma).toBe(1);
    });
  });

  describe('VAPID Key Generation & Persistence', () => {
    it('auto-generates and persists VAPID keys in server_settings', () => {
      const keys = getVapidKeys();

      expect(keys).toBeDefined();
      expect(typeof keys.publicKey).toBe('string');
      expect(typeof keys.privateKey).toBe('string');
      expect(keys.publicKey.length).toBeGreaterThan(20);
      expect(keys.privateKey.length).toBeGreaterThan(20);

      // Verify keys were stored in server_settings table
      const storedPublicKey = db
        .prepare("SELECT value FROM server_settings WHERE key = 'vapid_public_key'")
        .get() as { value: string } | undefined;
      const storedPrivateKey = db
        .prepare("SELECT value FROM server_settings WHERE key = 'vapid_private_key'")
        .get() as { value: string } | undefined;

      expect(storedPublicKey?.value).toBe(keys.publicKey);
      expect(storedPrivateKey?.value).toBe(keys.privateKey);

      // Subsequent calls should retrieve the exact same persisted keys
      const keysSecondCall = getVapidKeys();
      expect(keysSecondCall.publicKey).toBe(keys.publicKey);
      expect(keysSecondCall.privateKey).toBe(keys.privateKey);
    });
  });

  describe('User Pairing Logic', () => {
    it('creates couple and assigns slot 1 for the first user', () => {
      const result = pairUser('LOVE-4242', 'Alice');

      expect(result.couple).toBeDefined();
      expect(result.couple.code).toBe('LOVE-4242');
      expect(result.user).toBeDefined();
      expect(result.user.nickname).toBe('Alice');
      expect(result.user.slot).toBe(1);
      expect(result.user.couple_id).toBe(result.couple.id);
      expect(result.partner).toBeNull();
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBe(64); // 32 bytes hex encoded
    });

    it('normalizes couple code by trimming whitespace and converting to uppercase', () => {
      const result = pairUser('  love-8888  ', 'Alice');
      expect(result.couple.code).toBe('LOVE-8888');
    });

    it('joins existing couple with slot 2 and identifies slot 1 as partner', () => {
      const user1 = pairUser('COZY-1234', 'Alice');
      const user2 = pairUser('COZY-1234', 'Bob');

      expect(user2.couple.id).toBe(user1.couple.id);
      expect(user2.couple.code).toBe('COZY-1234');
      expect(user2.user.nickname).toBe('Bob');
      expect(user2.user.slot).toBe(2);
      expect(user2.partner).toBeDefined();
      expect(user2.partner?.id).toBe(user1.user.id);
      expect(user2.partner?.nickname).toBe('Alice');
      expect(user2.partner?.slot).toBe(1);
    });

    it('allows member to rejoin 1-person room with same nickname (case-insensitive) without taking slot 2', () => {
      const u1 = pairUser('REJOIN-1', 'Alice');
      const u1_rejoin = pairUser('REJOIN-1', 'alice'); // Case-insensitive

      expect(u1_rejoin.user.id).toBe(u1.user.id);
      expect(u1_rejoin.user.slot).toBe(1);
      expect(u1_rejoin.partner).toBeNull();
      expect(u1_rejoin.token).not.toBe(u1.token);
      // Both sessions remain active
      expect(getSession(u1.token)).not.toBeNull();
      expect(getSession(u1_rejoin.token)).not.toBeNull();

      // Partner can still join slot 2
      const u2 = pairUser('REJOIN-1', 'Bob');
      expect(u2.user.slot).toBe(2);
      expect(u2.partner?.id).toBe(u1.user.id);
    });

    it('allows both members to rejoin a full room with their existing nicknames (case-insensitive)', () => {
      const u1 = pairUser('REJOIN-2', 'Emma');
      const u2 = pairUser('REJOIN-2', 'Liam');

      // Emma rejoins
      const emmaRejoin = pairUser('REJOIN-2', 'EMMA');
      expect(emmaRejoin.user.id).toBe(u1.user.id);
      expect(emmaRejoin.partner?.id).toBe(u2.user.id);
      expect(emmaRejoin.partner?.nickname).toBe('Liam');

      // Liam rejoins
      const liamRejoin = pairUser('REJOIN-2', 'liam');
      expect(liamRejoin.user.id).toBe(u2.user.id);
      expect(liamRejoin.partner?.id).toBe(u1.user.id);
      expect(liamRejoin.partner?.nickname).toBe('Emma');
    });

    it('rejects a 3rd user attempting to join a full couple with "Couple code is full"', () => {
      pairUser('FULL-9999', 'Alice');
      pairUser('FULL-9999', 'Bob');

      expect(() => {
        pairUser('FULL-9999', 'Charlie');
      }).toThrow('Couple code is full');
    });

    it('rejects invalid or empty code and nickname', () => {
      expect(() => pairUser('', 'Alice')).toThrow();
      expect(() => pairUser('VALID', '')).toThrow();
      expect(() => pairUser('   ', 'Bob')).toThrow();
    });
  });

  describe('Room Join Attempt Lockout', () => {
    it('tracks failed join attempts per IP and room code, locking out after 5 failures and resetting on success', () => {
      const ip = '192.168.1.50';
      const code = 'TEST-LOCK';

      expect(checkRoomJoinLockout(ip, code).locked).toBe(false);

      // Record 4 failed attempts
      for (let i = 1; i <= 4; i++) {
        const res = recordRoomJoinFailedAttempt(ip, code);
        expect(res.locked).toBe(false);
        expect(res.attemptsLeft).toBe(5 - i);
      }

      // 5th attempt locks out
      const res5 = recordRoomJoinFailedAttempt(ip, code);
      expect(res5.locked).toBe(true);
      expect(res5.waitSeconds).toBeGreaterThan(0);

      // Check lockout status
      expect(checkRoomJoinLockout(ip, code).locked).toBe(true);

      // Reset
      resetRoomJoinFailedAttempts(ip, code);
      expect(checkRoomJoinLockout(ip, code).locked).toBe(false);
    });
  });

  describe('Session Management', () => {
    it('persists session and retrieves user, couple, and partner via getSession', () => {
      const u1 = pairUser('PAIR-7777', 'Alice');
      const u2 = pairUser('PAIR-7777', 'Bob');

      const session1 = getSession(u1.token);
      expect(session1).not.toBeNull();
      expect(session1?.user.id).toBe(u1.user.id);
      expect(session1?.user.nickname).toBe('Alice');
      expect(session1?.user.slot).toBe(1);
      expect(session1?.couple.id).toBe(u1.couple.id);
      expect(session1?.partner?.id).toBe(u2.user.id);
      expect(session1?.partner?.nickname).toBe('Bob');

      const session2 = getSession(u2.token);
      expect(session2).not.toBeNull();
      expect(session2?.user.id).toBe(u2.user.id);
      expect(session2?.partner?.id).toBe(u1.user.id);
    });

    it('returns null for an invalid or non-existent token', () => {
      const result = getSession('non-existent-token');
      expect(result).toBeNull();
    });

    it('returns null and cleans up expired sessions', () => {
      const u1 = pairUser('EXP-1111', 'Alice');

      // Force session to expire by updating expires_at to yesterday
      db.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 day') WHERE token = ?").run(u1.token);

      const result = getSession(u1.token);
      expect(result).toBeNull();

      // Ensure the expired row was cleaned up
      const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(u1.token);
      expect(row).toBeUndefined();
    });

    it('deletes session on deleteSession', () => {
      const u1 = pairUser('DEL-2222', 'Alice');

      expect(getSession(u1.token)).not.toBeNull();

      deleteSession(u1.token);

      expect(getSession(u1.token)).toBeNull();
    });
  });
});
