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
  SessionResult,
  UserPreset,
  DeviceLinkOtp
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
 * Explicitly sets the active Database instance.
 */
export function setDb(db: Database): void {
  dbInstance = db;
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

    CREATE TABLE IF NOT EXISTS user_presets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      label TEXT NOT NULL,
      color_theme TEXT DEFAULT 'rose',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_presets_user ON user_presets(user_id, sort_order);

    CREATE TABLE IF NOT EXISTS device_link_otps (
      code TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_device_link_otps_user ON device_link_otps(user_id);
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

  // Check expiration (handles invalid date or NaN safely)
  const expiresAt = new Date(session.expires_at).getTime();
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
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

/**
 * Retrieves the current mood for a given user.
 */
export function getMood(userId: string): Mood | null {
  if (!userId) return null;
  const db = dbInstance ?? getDb();
  const mood = db
    .prepare(
      'SELECT user_id, emoji, label, note, color_theme, updated_at FROM moods WHERE user_id = ?'
    )
    .get(userId) as Mood | undefined;
  return mood ?? null;
}

/**
 * Upserts a mood record for a user.
 */
export function setMood(
  userId: string,
  emoji: string,
  label: string,
  note?: string | null,
  colorTheme: string = 'rose'
): Mood {
  if (!userId) throw new Error('User ID is required');
  if (!emoji || !label) throw new Error('Emoji and label are required');

  const db = dbInstance ?? getDb();
  const theme = colorTheme || 'rose';
  const cleanNote = note ?? null;

  db.prepare(`
    INSERT INTO moods (user_id, emoji, label, note, color_theme, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      emoji = excluded.emoji,
      label = excluded.label,
      note = excluded.note,
      color_theme = excluded.color_theme,
      updated_at = datetime('now')
  `).run(userId, emoji, label, cleanNote, theme);

  const mood = getMood(userId);
  if (!mood) {
    throw new Error('Failed to retrieve updated mood');
  }
  return mood;
}

/**
 * Deletes a mood record for a user.
 */
export function deleteMood(userId: string): void {
  if (!userId) return;
  const db = dbInstance ?? getDb();
  db.prepare('DELETE FROM moods WHERE user_id = ?').run(userId);
}

/**
 * Saves or updates a push subscription for a user.
 */
export function savePushSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string
): PushSubscriptionRecord {
  if (!userId) throw new Error('User ID is required');
  if (!endpoint || !p256dh || !auth) throw new Error('Endpoint, p256dh, and auth are required');

  const db = dbInstance ?? getDb();
  const subId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth
  `).run(subId, userId, endpoint, p256dh, auth);

  const saved = db
    .prepare('SELECT id, user_id, endpoint, p256dh, auth, created_at FROM push_subscriptions WHERE endpoint = ?')
    .get(endpoint) as PushSubscriptionRecord;

  return saved;
}

/**
 * Deletes a push subscription by endpoint, optionally scoped to a user.
 */
export function deletePushSubscription(endpoint: string, userId?: string): void {
  if (!endpoint) return;
  const db = dbInstance ?? getDb();
  if (userId) {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, userId);
  } else {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  }
}

/**
 * Retrieves all push subscriptions for a user.
 */
export function getPushSubscriptions(userId: string): PushSubscriptionRecord[] {
  if (!userId) return [];
  const db = dbInstance ?? getDb();
  return db
    .prepare(
      'SELECT id, user_id, endpoint, p256dh, auth, created_at FROM push_subscriptions WHERE user_id = ?'
    )
    .all(userId) as PushSubscriptionRecord[];
}

export interface DefaultPresetDefinition {
  emoji: string;
  label: string;
  color_theme: string;
}

export const DEFAULT_PRESETS_TH: DefaultPresetDefinition[] = [
  { emoji: '🥺', label: 'คิดถึง', color_theme: 'rose' },
  { emoji: '🤤', label: 'หิว', color_theme: 'amber' },
  { emoji: '🥰', label: 'รักนะ', color_theme: 'rose' },
  { emoji: '😴', label: 'ง่วง', color_theme: 'purple' },
  { emoji: '💻', label: 'ยุ่งมาก', color_theme: 'indigo' },
  { emoji: '☕', label: 'ชิลๆ', color_theme: 'amber' },
  { emoji: '🤒', label: 'ไม่สบาย', color_theme: 'teal' }
];

export const DEFAULT_PRESETS_EN: DefaultPresetDefinition[] = [
  { emoji: '🥺', label: 'Missing you', color_theme: 'rose' },
  { emoji: '🤤', label: 'Hungry', color_theme: 'amber' },
  { emoji: '🥰', label: 'Loving', color_theme: 'rose' },
  { emoji: '😴', label: 'Sleepy', color_theme: 'purple' },
  { emoji: '💻', label: 'Busy', color_theme: 'indigo' },
  { emoji: '☕', label: 'Cozy', color_theme: 'amber' },
  { emoji: '🤒', label: 'Sick', color_theme: 'teal' }
];

/**
 * Returns user's custom presets. If none exist, returns default presets for lang ('th' | 'en').
 */
export function getUserPresets(userId: string, lang: string = 'th'): UserPreset[] {
  if (!userId) return [];
  const db = dbInstance ?? getDb();
  const rows = db
    .prepare(
      'SELECT id, user_id, emoji, label, color_theme, sort_order, created_at FROM user_presets WHERE user_id = ? ORDER BY sort_order ASC'
    )
    .all(userId) as UserPreset[];

  if (rows.length > 0) {
    return rows;
  }

  const defs = lang === 'en' ? DEFAULT_PRESETS_EN : DEFAULT_PRESETS_TH;
  return defs.map((preset, index) => ({
    id: `default-${index}`,
    user_id: userId,
    emoji: preset.emoji,
    label: preset.label,
    color_theme: preset.color_theme,
    sort_order: index
  }));
}

/**
 * In a database transaction, deletes existing user presets and inserts new presets with sort_order.
 */
export function setUserPresets(
  userId: string,
  presets: Array<{ emoji: string; label: string; colorTheme?: string; color_theme?: string }>
): UserPreset[] {
  if (!userId) throw new Error('User ID is required');
  const db = dbInstance ?? getDb();

  const setTx = db.transaction(() => {
    db.prepare('DELETE FROM user_presets WHERE user_id = ?').run(userId);
    const insertStmt = db.prepare(`
      INSERT INTO user_presets (id, user_id, emoji, label, color_theme, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    presets.forEach((preset, index) => {
      const id = crypto.randomUUID();
      const theme = preset.colorTheme || preset.color_theme || 'rose';
      insertStmt.run(id, userId, preset.emoji.trim(), preset.label.trim(), theme, index);
    });
  });

  setTx();

  return getUserPresets(userId);
}

/**
 * Deletes a user's custom presets so defaults are restored.
 */
export function resetUserPresets(userId: string): void {
  if (!userId) return;
  const db = dbInstance ?? getDb();
  db.prepare('DELETE FROM user_presets WHERE user_id = ?').run(userId);
}

/**
 * Generates a 6-digit numeric OTP for linking a new device, valid for 5 minutes.
 * Deletes any existing pending OTPs for this user.
 */
export function createDeviceLinkOtp(userId: string): { code: string; expiresAt: string } {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const db = dbInstance ?? getDb();

  // Delete any prior OTPs for this user
  db.prepare('DELETE FROM device_link_otps WHERE user_id = ?').run(userId);

  // Generate 6-digit numeric code
  const code = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO device_link_otps (code, user_id, expires_at, failed_attempts)
    VALUES (?, ?, ?, 0)
  `).run(code, userId, expiresAt);

  return { code, expiresAt };
}

/**
 * Verifies a 6-digit device link OTP.
 * On success, creates a new session for the user and deletes the OTP.
 * Throws with appropriate status:
 * - 404: Invalid or expired code
 * - 410: Code has expired
 * - 429: Too many failed attempts
 */
export function verifyDeviceLinkOtp(code: string): PairResult {
  const normalizedCode = code?.trim();
  if (!normalizedCode) {
    const err = new Error('Invalid or expired code');
    (err as unknown as { status: number }).status = 404;
    throw err;
  }

  const db = dbInstance ?? getDb();

  const otp = db
    .prepare('SELECT code, user_id, expires_at, failed_attempts FROM device_link_otps WHERE code = ?')
    .get(normalizedCode) as DeviceLinkOtp | undefined;

  if (!otp) {
    const err = new Error('Invalid or expired code');
    (err as unknown as { status: number }).status = 404;
    throw err;
  }

  // Check failed attempts (lockout threshold: 5)
  if (otp.failed_attempts >= 5) {
    db.prepare('DELETE FROM device_link_otps WHERE code = ?').run(normalizedCode);
    const err = new Error('Too many failed attempts');
    (err as unknown as { status: number }).status = 429;
    throw err;
  }

  // Check expiration
  const expiresAt = new Date(otp.expires_at).getTime();
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
    db.prepare('DELETE FROM device_link_otps WHERE code = ?').run(normalizedCode);
    const err = new Error('Code has expired');
    (err as unknown as { status: number }).status = 410;
    throw err;
  }

  // Fetch user
  const user = db
    .prepare('SELECT id, couple_id, nickname, slot, created_at FROM users WHERE id = ?')
    .get(otp.user_id) as User | undefined;

  if (!user) {
    db.prepare('DELETE FROM device_link_otps WHERE code = ?').run(normalizedCode);
    const err = new Error('User not found');
    (err as unknown as { status: number }).status = 404;
    throw err;
  }

  // Fetch couple
  const couple = db
    .prepare('SELECT id, code, created_at FROM couples WHERE id = ?')
    .get(user.couple_id) as Couple | undefined;

  if (!couple) {
    db.prepare('DELETE FROM device_link_otps WHERE code = ?').run(normalizedCode);
    const err = new Error('Couple not found');
    (err as unknown as { status: number }).status = 404;
    throw err;
  }

  // Fetch partner
  const partner = db
    .prepare(
      'SELECT id, couple_id, nickname, slot, created_at FROM users WHERE couple_id = ? AND id != ?'
    )
    .get(user.couple_id, user.id) as User | undefined;

  // Redeem OTP in transaction: issue session token and delete OTP
  const redeemTx = db.transaction((): PairResult => {
    const token = crypto.randomBytes(32).toString('hex');
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
      token,
      user.id,
      sessionExpiresAt
    );

    db.prepare('DELETE FROM device_link_otps WHERE code = ?').run(normalizedCode);

    return {
      user,
      couple,
      partner: partner ?? null,
      token
    };
  });

  return redeemTx();
}

/**
 * Increments failed attempts for an OTP.
 */
export function recordOtpFailure(code: string): void {
  const normalizedCode = code?.trim();
  if (!normalizedCode) return;

  const db = dbInstance ?? getDb();
  db.prepare(
    'UPDATE device_link_otps SET failed_attempts = failed_attempts + 1 WHERE code = ?'
  ).run(normalizedCode);
}

/**
 * Logs out a session by deleting the session token.
 */
export function logoutSession(token: string): void {
  deleteSession(token);
}


