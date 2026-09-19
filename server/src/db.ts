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
  DeviceLinkOtp,
  AdminSessionDetail,
  AdminStats,
  AdminCoupleDetail,
  AdminCoupleMember
} from './types.js';
import { parseUserAgent } from './device.js';
import {
  isTokenOnline,
  closeSessionConnections,
  closeUserConnections,
  closeAllConnections,
  getConnectionCount
} from './sse.js';



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
      user_agent TEXT,
      device_info TEXT,
      last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      ip TEXT PRIMARY KEY,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until DATETIME
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

    CREATE TABLE IF NOT EXISTS room_join_attempts (
      key TEXT PRIMARY KEY,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until DATETIME
    );
  `);

  // Safe migration for existing databases: ensure new session columns exist
  try {
    const pragma = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
    const cols = new Set(pragma.map(c => c.name));
    if (!cols.has('user_agent')) {
      db.exec('ALTER TABLE sessions ADD COLUMN user_agent TEXT');
    }
    if (!cols.has('device_info')) {
      db.exec('ALTER TABLE sessions ADD COLUMN device_info TEXT');
    }
    if (!cols.has('last_active_at')) {
      db.exec('ALTER TABLE sessions ADD COLUMN last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    }
  } catch {
    // Ignore migration error if table doesn't exist yet
  }
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
export function pairUser(code: string, nickname: string, userAgent?: string): PairResult {
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

    // 3. Check if an existing member has the same nickname (case-insensitive) to rejoin
    const matchingUser = existingUsers.find(
      (u) => u.nickname.trim().toLowerCase() === trimmedNickname.toLowerCase()
    );

    if (matchingUser) {
      // Rejoining as existing user — determine partner (if another member exists)
      const partner = existingUsers.find((u) => u.id !== matchingUser.id) || null;

      // Generate new 32-byte cryptographic session token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const deviceInfo = parseUserAgent(userAgent);

      db.prepare(
        'INSERT INTO sessions (token, user_id, user_agent, device_info, last_active_at, expires_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)'
      ).run(
        token,
        matchingUser.id,
        userAgent ?? null,
        deviceInfo,
        expiresAt
      );

      return {
        user: matchingUser,
        couple,
        partner,
        token
      };
    }

    // 4. If nickname does not match existing user, room must not be full
    if (existingUsers.length >= 2) {
      const err = new Error('Couple code is full. If you are already a member, please enter your registered nickname.');
      (err as unknown as { status: number }).status = 409;
      throw err;
    }

    // 5. Determine slot and partner for new user
    let slot: 1 | 2;
    let partner: User | null = null;

    if (existingUsers.length === 0) {
      slot = 1;
      partner = null;
    } else {
      partner = existingUsers[0];
      slot = (partner.slot === 1 ? 2 : 1) as 1 | 2;
    }

    // 6. Create user
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

    // 7. Generate 32-byte cryptographic session token (64 hex characters)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const deviceInfo = parseUserAgent(userAgent);

    db.prepare(
      'INSERT INTO sessions (token, user_id, user_agent, device_info, last_active_at, expires_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)'
    ).run(
      token,
      userId,
      userAgent ?? null,
      deviceInfo,
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

  // Touch last_active_at
  try {
    db.prepare('UPDATE sessions SET last_active_at = CURRENT_TIMESTAMP WHERE token = ?').run(token);
  } catch {
    // Ignore error
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
export function verifyDeviceLinkOtp(code: string, userAgent?: string): PairResult {
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
    const deviceInfo = parseUserAgent(userAgent);

    db.prepare(
      'INSERT INTO sessions (token, user_id, user_agent, device_info, last_active_at, expires_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)'
    ).run(
      token,
      user.id,
      userAgent ?? null,
      deviceInfo,
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

/* ==========================================================================
   Admin Subsystem: Authentication, Brute-Force Lockout, Session Management
   ========================================================================== */

const MAX_ADMIN_FAILED_ATTEMPTS = 5;
const ADMIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Checks whether an IP is currently locked out from admin login attempts.
 */
export function checkAdminLockout(ip: string): { locked: boolean; waitSeconds?: number } {
  if (!ip) return { locked: false };
  const db = dbInstance ?? getDb();
  const row = db
    .prepare('SELECT failed_attempts, locked_until FROM admin_login_attempts WHERE ip = ?')
    .get(ip) as { failed_attempts: number; locked_until: string | null } | undefined;

  if (!row || !row.locked_until) {
    return { locked: false };
  }

  const lockedTime = new Date(row.locked_until).getTime();
  const now = Date.now();
  if (lockedTime > now) {
    return {
      locked: true,
      waitSeconds: Math.ceil((lockedTime - now) / 1000)
    };
  }

  // Lockout expired: remove record
  db.prepare('DELETE FROM admin_login_attempts WHERE ip = ?').run(ip);
  return { locked: false };
}

/**
 * Records a failed admin login attempt for an IP.
 * Triggers a 15-minute lockout when 5 failures are reached.
 */
export function recordAdminFailedAttempt(ip: string): { locked: boolean; waitSeconds?: number; attemptsLeft: number } {
  if (!ip) return { locked: false, attemptsLeft: MAX_ADMIN_FAILED_ATTEMPTS };
  const db = dbInstance ?? getDb();
  const row = db
    .prepare('SELECT failed_attempts FROM admin_login_attempts WHERE ip = ?')
    .get(ip) as { failed_attempts: number } | undefined;

  const currentAttempts = (row?.failed_attempts ?? 0) + 1;

  if (currentAttempts >= MAX_ADMIN_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + ADMIN_LOCKOUT_MS).toISOString();
    db.prepare(`
      INSERT INTO admin_login_attempts (ip, failed_attempts, locked_until)
      VALUES (?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET failed_attempts = excluded.failed_attempts, locked_until = excluded.locked_until
    `).run(ip, currentAttempts, lockedUntil);

    return {
      locked: true,
      waitSeconds: Math.ceil(ADMIN_LOCKOUT_MS / 1000),
      attemptsLeft: 0
    };
  }

  db.prepare(`
    INSERT INTO admin_login_attempts (ip, failed_attempts, locked_until)
    VALUES (?, ?, NULL)
    ON CONFLICT(ip) DO UPDATE SET failed_attempts = excluded.failed_attempts, locked_until = NULL
  `).run(ip, currentAttempts);

  return {
    locked: false,
    attemptsLeft: MAX_ADMIN_FAILED_ATTEMPTS - currentAttempts
  };
}

/**
 * Resets failed admin login attempts for an IP upon successful login.
 */
export function resetAdminFailedAttempts(ip: string): void {
  if (!ip) return;
  const db = dbInstance ?? getDb();
  db.prepare('DELETE FROM admin_login_attempts WHERE ip = ?').run(ip);
}

export const MAX_ROOM_JOIN_FAILED_ATTEMPTS = 5;
export const ROOM_JOIN_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Checks whether an (IP, couple_code) pair is currently locked out from join attempts.
 */
export function checkRoomJoinLockout(ip: string, code: string): { locked: boolean; waitSeconds?: number } {
  if (!ip || !code) return { locked: false };
  const normalizedKey = `${ip.trim()}:${code.trim().toUpperCase()}`;
  const db = dbInstance ?? getDb();
  const row = db
    .prepare('SELECT failed_attempts, locked_until FROM room_join_attempts WHERE key = ?')
    .get(normalizedKey) as { failed_attempts: number; locked_until: string | null } | undefined;

  if (!row || !row.locked_until) {
    return { locked: false };
  }

  const lockedTime = new Date(row.locked_until).getTime();
  const now = Date.now();
  if (lockedTime > now) {
    return {
      locked: true,
      waitSeconds: Math.ceil((lockedTime - now) / 1000)
    };
  }

  // Lockout expired: remove record
  db.prepare('DELETE FROM room_join_attempts WHERE key = ?').run(normalizedKey);
  return { locked: false };
}

/**
 * Records a failed join attempt for an (IP, couple_code) on a full room.
 * Triggers a 5-minute lockout when 5 failures are reached.
 */
export function recordRoomJoinFailedAttempt(ip: string, code: string): { locked: boolean; waitSeconds?: number; attemptsLeft: number } {
  if (!ip || !code) return { locked: false, attemptsLeft: MAX_ROOM_JOIN_FAILED_ATTEMPTS };
  const normalizedKey = `${ip.trim()}:${code.trim().toUpperCase()}`;
  const db = dbInstance ?? getDb();
  const row = db
    .prepare('SELECT failed_attempts FROM room_join_attempts WHERE key = ?')
    .get(normalizedKey) as { failed_attempts: number } | undefined;

  const currentAttempts = (row?.failed_attempts ?? 0) + 1;

  if (currentAttempts >= MAX_ROOM_JOIN_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + ROOM_JOIN_LOCKOUT_MS).toISOString();
    db.prepare(`
      INSERT INTO room_join_attempts (key, failed_attempts, locked_until)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET failed_attempts = excluded.failed_attempts, locked_until = excluded.locked_until
    `).run(normalizedKey, currentAttempts, lockedUntil);

    return {
      locked: true,
      waitSeconds: Math.ceil(ROOM_JOIN_LOCKOUT_MS / 1000),
      attemptsLeft: 0
    };
  }

  db.prepare(`
    INSERT INTO room_join_attempts (key, failed_attempts, locked_until)
    VALUES (?, ?, NULL)
    ON CONFLICT(key) DO UPDATE SET failed_attempts = excluded.failed_attempts, locked_until = NULL
  `).run(normalizedKey, currentAttempts);

  return {
    locked: false,
    attemptsLeft: MAX_ROOM_JOIN_FAILED_ATTEMPTS - currentAttempts
  };
}

/**
 * Resets failed join attempts for an (IP, couple_code) upon successful join or rejoin.
 */
export function resetRoomJoinFailedAttempts(ip: string, code: string): void {
  if (!ip || !code) return;
  const normalizedKey = `${ip.trim()}:${code.trim().toUpperCase()}`;
  const db = dbInstance ?? getDb();
  db.prepare('DELETE FROM room_join_attempts WHERE key = ?').run(normalizedKey);
}

/**
 * Verifies admin password using timing-safe comparison against ADMIN_PASSWORD env var.
 * Falls back to 'admin123' if not explicitly configured.
 */
export function verifyAdminPassword(password: string): boolean {
  if (typeof password !== 'string') return false;
  const expectedPassword = process.env.ADMIN_PASSWORD || 'admin123';

  const bufA = Buffer.from(password);
  const bufB = Buffer.from(expectedPassword);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Creates an admin session token valid for 24 hours.
 */
export function createAdminSession(): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const db = dbInstance ?? getDb();
  db.prepare('INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)').run(token, expiresAt);
  return token;
}

/**
 * Validates an admin session token.
 */
export function verifyAdminSession(token: string): boolean {
  if (!token) return false;
  const db = dbInstance ?? getDb();
  const session = db
    .prepare('SELECT token, expires_at FROM admin_sessions WHERE token = ?')
    .get(token) as { token: string; expires_at: string } | undefined;

  if (!session) return false;

  const expiresTime = new Date(session.expires_at).getTime();
  if (Number.isNaN(expiresTime) || expiresTime <= Date.now()) {
    db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
    return false;
  }

  return true;
}

/**
 * Deletes an admin session token (logout).
 */
export function deleteAdminSession(token: string): void {
  if (!token) return;
  const db = dbInstance ?? getDb();
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
}

/**
 * Retrieves all client sessions with joined user and couple details.
 */
export function getAllSessionsWithDetails(): AdminSessionDetail[] {
  const db = dbInstance ?? getDb();
  const rows = db.prepare(`
    SELECT 
      s.token,
      s.user_id,
      s.user_agent,
      s.device_info,
      s.last_active_at,
      s.created_at,
      u.nickname AS user_nickname,
      u.slot AS user_slot,
      c.id AS couple_id,
      c.code AS couple_code
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    JOIN couples c ON u.couple_id = c.id
    ORDER BY s.last_active_at DESC, s.created_at DESC
  `).all() as any[];

  return rows.map((r) => {
    const token = r.token;
    const token_preview = token.length > 12 ? `${token.slice(0, 6)}...${token.slice(-4)}` : token;
    return {
      token: r.token,
      token_preview,
      user_id: r.user_id,
      user_nickname: r.user_nickname,
      user_slot: r.user_slot,
      couple_id: r.couple_id,
      couple_code: r.couple_code,
      device_info: r.device_info || parseUserAgent(r.user_agent),
      user_agent: r.user_agent ?? null,
      created_at: r.created_at,
      last_active_at: r.last_active_at || r.created_at,
      is_online: isTokenOnline(r.token)
    };
  });
}

/**
 * Computes high-level overview metrics for the admin dashboard.
 */
export function getAdminStats(): AdminStats {
  const db = dbInstance ?? getDb();
  const totalCouples = (db.prepare('SELECT COUNT(*) as count FROM couples').get() as { count: number }).count;
  const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  const totalSessions = (db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count;
  const liveConnections = getConnectionCount();

  return {
    total_couples: totalCouples,
    total_users: totalUsers,
    total_sessions: totalSessions,
    live_connections: liveConnections
  };
}

/**
 * Revokes a single session by token and kicks any active live SSE connection.
 */
export function revokeSession(token: string): boolean {
  if (!token) return false;
  closeSessionConnections(token);
  const db = dbInstance ?? getDb();
  const info = db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  return info.changes > 0;
}

/**
 * Revokes all sessions for a specific user and terminates their live SSE streams.
 */
export function revokeSessionsByUser(userId: string): number {
  if (!userId) return 0;
  closeUserConnections(userId);
  const db = dbInstance ?? getDb();
  const info = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return info.changes;
}

/**
 * Revokes all sessions for all users of a couple and terminates their live SSE streams.
 */
export function revokeSessionsByCouple(coupleId: string): number {
  if (!coupleId) return 0;
  const db = dbInstance ?? getDb();
  const users = db.prepare('SELECT id FROM users WHERE couple_id = ?').all(coupleId) as Array<{ id: string }>;
  for (const u of users) {
    closeUserConnections(u.id);
  }
  const info = db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE couple_id = ?)').run(coupleId);
  return info.changes;
}

/**
 * Revokes ALL sessions system-wide and disconnects all clients.
 */
export function revokeAllSessions(): number {
  closeAllConnections();
  const db = dbInstance ?? getDb();
  const info = db.prepare('DELETE FROM sessions').run();
  return info.changes;
}

/**
 * Retrieves all couple rooms with joined member nicknames, slots, current moods, and active session counts.
 */
export function getAllCouplesWithDetails(): AdminCoupleDetail[] {
  const db = dbInstance ?? getDb();

  const couples = db
    .prepare('SELECT id, code, created_at FROM couples ORDER BY created_at DESC')
    .all() as Couple[];

  return couples.map((c) => {
    const users = db
      .prepare('SELECT id, nickname, slot, created_at FROM users WHERE couple_id = ? ORDER BY slot ASC')
      .all(c.id) as Array<{ id: string; nickname: string; slot: 1 | 2; created_at: string }>;

    const members: AdminCoupleMember[] = users.map((u) => {
      const mood = db
        .prepare('SELECT emoji, label, note, updated_at FROM moods WHERE user_id = ?')
        .get(u.id) as { emoji: string; label: string; note: string | null; updated_at: string } | undefined;

      return {
        id: u.id,
        nickname: u.nickname,
        slot: u.slot,
        created_at: u.created_at,
        mood: mood ?? null,
      };
    });

    const activeSessions = (db
      .prepare('SELECT COUNT(*) as count FROM sessions WHERE user_id IN (SELECT id FROM users WHERE couple_id = ?)')
      .get(c.id) as { count: number }).count;

    return {
      id: c.id,
      code: c.code,
      created_at: c.created_at || '',
      members,
      active_sessions_count: activeSessions,
    };
  });
}

/**
 * Permanently deletes a couple room and cascades to all users, sessions, moods, presets, and tokens.
 * Immediately notifies and disconnects any connected devices via SSE.
 */
export function deleteCouple(coupleId: string): boolean {
  if (!coupleId) return false;
  const db = dbInstance ?? getDb();

  // Find all users in this couple and close their SSE connections
  const users = db
    .prepare('SELECT id FROM users WHERE couple_id = ?')
    .all(coupleId) as Array<{ id: string }>;

  for (const u of users) {
    closeUserConnections(u.id);
  }

  // Delete couple (FOREIGN KEY ON DELETE CASCADE cleans up users, sessions, moods, presets, push_subscriptions, and OTPs)
  const info = db.prepare('DELETE FROM couples WHERE id = ?').run(coupleId);
  return info.changes > 0;
}




