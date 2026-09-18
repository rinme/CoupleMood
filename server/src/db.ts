import DatabaseConstructor from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import type {
  Couple,
  User,
  Session,
  Mood,
  PushSubscriptionRecord,
  ServerSetting,
  VapidKeys,
  PairResult,
  SessionResult
} from './types.js';

let dbInstance: Database | null = null;

/**
 * Returns the currently active Database instance.
 * Initializes an in-memory database or disk database if not already initialized.
 */
export function getDb(): Database {
  if (!dbInstance) {
    dbInstance = initDb();
  }
  return dbInstance;
}

/**
 * Initializes the SQLite database, configures pragmas, creates tables,
 * and ensures VAPID keys are initialized.
 */
export function initDb(dbPath?: string): Database {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore already closed instance
    }
    dbInstance = null;
  }

  const resolvedPath = dbPath ?? process.env.DB_PATH ?? path.resolve(process.cwd(), 'data/mood.db');

  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseConstructor(resolvedPath);

  // Enable foreign keys and WAL mode (for disk databases)
  db.pragma('foreign_keys = ON');
  if (resolvedPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  createSchema(db);

  dbInstance = db;

  // Ensure VAPID keys are auto-generated/stored
  getVapidKeys();

  return dbInstance;
}

/**
 * Closes the active database connection if open.
 */
export function closeDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore close errors
    }
    dbInstance = null;
  }
}

/**
 * Creates database tables if they do not already exist.
 */
function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS couples (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      couple_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (couple_id) REFERENCES couples(id) ON DELETE CASCADE,
      UNIQUE(couple_id, slot)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS moods (
      user_id TEXT PRIMARY KEY,
      emoji TEXT NOT NULL,
      label TEXT NOT NULL,
      note TEXT,
      color_theme TEXT DEFAULT 'rose',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS server_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

/**
 * Retrieves VAPID public and private keys.
 * Uses environment variables if set, otherwise reads from or creates in server_settings.
 */
export function getVapidKeys(): VapidKeys {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY
    };
  }

  const db = dbInstance ?? getDb();

  const pubRow = db
    .prepare("SELECT value FROM server_settings WHERE key = 'vapid_public_key'")
    .get() as { value: string } | undefined;
  const privRow = db
    .prepare("SELECT value FROM server_settings WHERE key = 'vapid_private_key'")
    .get() as { value: string } | undefined;

  if (pubRow && privRow) {
    return {
      publicKey: pubRow.value,
      privateKey: privRow.value
    };
  }

  // Generate new VAPID keypair
  const newKeys = webpush.generateVAPIDKeys();

  const insertStmt = db.prepare(
    'INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)'
  );

  const saveTx = db.transaction(() => {
    insertStmt.run('vapid_public_key', newKeys.publicKey);
    insertStmt.run('vapid_private_key', newKeys.privateKey);
  });

  saveTx();

  return newKeys;
}

/**
 * Pairs a user into a couple room.
 * - Slot 1 if couple is newly created or empty
 * - Slot 2 if 1 user already exists
 * - Throws 'Couple code is full' (with 409 status) if 2 users already exist
 */
export function pairUser(code: string, nickname: string): PairResult {
  const normalizedCode = code?.trim().toUpperCase();
  const trimmedNickname = nickname?.trim();

  if (!normalizedCode) {
    throw new Error('Couple code is required');
  }
  if (!trimmedNickname) {
    throw new Error('Nickname is required');
  }

  const db = dbInstance ?? getDb();

  const pairTx = db.transaction((): PairResult => {
    // 1. Fetch or create couple
    let couple = db
      .prepare('SELECT id, code, created_at FROM couples WHERE code = ?')
      .get(normalizedCode) as Couple | undefined;

    if (!couple) {
      const coupleId = crypto.randomUUID();
      db.prepare('INSERT INTO couples (id, code) VALUES (?, ?)').run(
        coupleId,
        normalizedCode
      );
      couple = {
        id: coupleId,
        code: normalizedCode
      };
    }

    // 2. Fetch existing users for this couple
    const existingUsers = db
      .prepare('SELECT id, couple_id, nickname, slot, created_at FROM users WHERE couple_id = ? ORDER BY slot ASC')
      .all(couple.id) as User[];

    if (existingUsers.length >= 2) {
      const err = new Error('Couple code is full');
      (err as unknown as { status: number }).status = 409;
      throw err;
    }

    // 3. Determine slot and partner
    let slot: 1 | 2;
    let partner: User | null = null;

    if (existingUsers.length === 0) {
      slot = 1;
      partner = null;
    } else {
      partner = existingUsers[0];
      slot = (partner.slot === 1 ? 2 : 1) as 1 | 2;
    }

    // 4. Create user
    const userId = crypto.randomUUID();
    db.prepare('INSERT INTO users (id, couple_id, nickname, slot) VALUES (?, ?, ?, ?)').run(
      userId,
      couple.id,
      trimmedNickname,
      slot
    );

    const user: User = {
      id: userId,
      couple_id: couple.id,
      nickname: trimmedNickname,
      slot
    };

    // 5. Generate 32-byte cryptographic session token (64 hex characters)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
      token,
      userId,
      expiresAt
    );

    return {
      user,
      couple,
      partner,
      token
    };
  });

  return pairTx();
}

/**
 * Retrieves session, user, couple, and partner by session token.
 * Returns null if token does not exist or has expired (deleting expired sessions).
 */
export function getSession(token: string): SessionResult | null {
  if (!token) {
    return null;
  }

  const db = dbInstance ?? getDb();

  const session = db
    .prepare('SELECT token, user_id, created_at, expires_at FROM sessions WHERE token = ?')
    .get(token) as Session | undefined;

  if (!session) {
    return null;
  }

  // Check expiration
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  // Fetch user
  const user = db
    .prepare('SELECT id, couple_id, nickname, slot, created_at FROM users WHERE id = ?')
    .get(session.user_id) as User | undefined;

  if (!user) {
    return null;
  }

  // Fetch couple
  const couple = db
    .prepare('SELECT id, code, created_at FROM couples WHERE id = ?')
    .get(user.couple_id) as Couple | undefined;

  if (!couple) {
    return null;
  }

  // Fetch partner
  const partner = db
    .prepare(
      'SELECT id, couple_id, nickname, slot, created_at FROM users WHERE couple_id = ? AND id != ?'
    )
    .get(user.couple_id, user.id) as User | undefined;

  return {
    user,
    couple,
    partner: partner ?? null
  };
}

/**
 * Deletes a session by token.
 */
export function deleteSession(token: string): void {
  if (!token) {
    return;
  }

  const db = dbInstance ?? getDb();
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
