import crypto from 'crypto';
import webpush from 'web-push';
import { parseUserAgent } from './device.js';
import { getRedis, resetRedisMock, IRedisClient } from './redis.js';
import {
  closeSessionConnections,
  closeUserConnections,
  closeAllConnections,
  isTokenOnline,
  getConnectionCount
} from './sse.js';
import type {
  User,
  Couple,
  Session,
  Mood,
  PushSubscription,
  PairResult,
  SessionWithUser,
  VapidKeys,
  AdminSession,
  AdminSessionDetail,
  AdminStats,
  AdminCoupleMember,
  AdminCoupleDetail,
  UserPreset,
  UserPresetInput
} from './types.js';

export const DEFAULT_USER_PRESETS_TH: UserPresetInput[] = [
  { emoji: '🥺', label: 'คิดถึง', color_theme: 'rose', sort_order: 0 },
  { emoji: '🤤', label: 'หิว', color_theme: 'amber', sort_order: 1 },
  { emoji: '🥰', label: 'รักนะ', color_theme: 'rose', sort_order: 2 },
  { emoji: '😴', label: 'ง่วง', color_theme: 'slate', sort_order: 3 },
  { emoji: '💻', label: 'ยุ่งมาก', color_theme: 'indigo', sort_order: 4 },
  { emoji: '☕', label: 'ชิลๆ', color_theme: 'emerald', sort_order: 5 },
  { emoji: '🤒', label: 'ไม่สบาย', color_theme: 'rose', sort_order: 6 },
];

export const DEFAULT_USER_PRESETS_EN: UserPresetInput[] = [
  { emoji: '🥺', label: 'Missing you', color_theme: 'rose', sort_order: 0 },
  { emoji: '🤤', label: 'Hungry', color_theme: 'amber', sort_order: 1 },
  { emoji: '🥰', label: 'Loving', color_theme: 'rose', sort_order: 2 },
  { emoji: '😴', label: 'Sleepy', color_theme: 'slate', sort_order: 3 },
  { emoji: '💻', label: 'Busy', color_theme: 'indigo', sort_order: 4 },
  { emoji: '☕', label: 'Cozy', color_theme: 'emerald', sort_order: 5 },
  { emoji: '🤒', label: 'Sick', color_theme: 'rose', sort_order: 6 },
];

export const DEFAULT_USER_PRESETS = DEFAULT_USER_PRESETS_TH;

export const MAX_ADMIN_FAILED_ATTEMPTS = 5;
export const ADMIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export const MAX_ROOM_JOIN_FAILED_ATTEMPTS = 5;
export const ROOM_JOIN_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

// In-memory cache for VAPID keys to avoid repeated generation/calls
let cachedVapidKeys: VapidKeys | null = null;

/**
 * Initializes or resets the database/store.
 * When called with ':memory:' or in tests, resets the in-memory Redis mock store.
 */
export function initDb(_dbPath: string = ':memory:'): IRedisClient {
  resetRedisMock();
  return getRedis();
}

export function getDb(): IRedisClient {
  return getRedis();
}

export function setDb(_db: any): void {
  // Provided for backward compatibility in existing test suites
}

export function closeDb(): void {
  // No persistent connection to close for HTTP-based / in-memory Redis
}

/**
 * Retrieves VAPID public and private keys.
 * Uses environment variables if set, otherwise reads from or creates in Redis settings.
 */
export async function getVapidKeys(): Promise<VapidKeys> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY
    };
  }

  if (cachedVapidKeys) {
    return cachedVapidKeys;
  }

  const redis = getRedis();
  const pub = await redis.get<string>('settings:vapid_public_key');
  const priv = await redis.get<string>('settings:vapid_private_key');

  if (pub && priv) {
    cachedVapidKeys = { publicKey: pub, privateKey: priv };
    return cachedVapidKeys;
  }

  const newKeys = webpush.generateVAPIDKeys();
  await redis.set('settings:vapid_public_key', newKeys.publicKey);
  await redis.set('settings:vapid_private_key', newKeys.privateKey);

  cachedVapidKeys = newKeys;
  return newKeys;
}

/**
 * Synchronous getter for VAPID keys if already cached or in env, with safe fallback generation.
 */
export function getVapidKeysSync(): VapidKeys {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY
    };
  }
  if (cachedVapidKeys) {
    return cachedVapidKeys;
  }
  const newKeys = webpush.generateVAPIDKeys();
  cachedVapidKeys = newKeys;
  return newKeys;
}

/**
 * Helper to fetch all users in a couple.
 */
async function getCoupleUsers(coupleId: string): Promise<User[]> {
  const redis = getRedis();
  const userIds = await redis.smembers(`couple_users:${coupleId}`);
  if (!userIds || userIds.length === 0) return [];

  const users: User[] = [];
  for (const uid of userIds) {
    const user = await redis.get<User>(`users:${uid}`);
    if (user) users.push(user);
  }

  return users.sort((a, b) => a.slot - b.slot);
}

/**
 * Pairs a user into a couple room.
 * - Reconnects/rejoins existing member if nickname matches (case-insensitive)
 * - Slot 1 if couple is newly created or empty
 * - Slot 2 if 1 user already exists
 * - Throws 'Couple code is full' (with 409 status) if 2 users already exist and nickname doesn't match
 */
export async function pairUser(code: string, nickname: string, userAgent?: string): Promise<PairResult> {
  const normalizedCode = code?.trim().toUpperCase();
  const trimmedNickname = nickname?.trim();

  if (!normalizedCode) {
    throw new Error('Couple code is required');
  }
  if (!trimmedNickname) {
    throw new Error('Nickname is required');
  }

  const redis = getRedis();

  // 1. Fetch or create couple
  let couple = await redis.get<Couple>(`couples:${normalizedCode}`);
  if (!couple) {
    const coupleId = crypto.randomUUID();
    couple = {
      id: coupleId,
      code: normalizedCode,
      created_at: new Date().toISOString()
    };
    await redis.set(`couples:${normalizedCode}`, couple);
    await redis.set(`couple_by_id:${coupleId}`, normalizedCode);
    await redis.sadd('all_couples', coupleId);
  }

  // 2. Fetch existing users for this couple
  const existingUsers = await getCoupleUsers(couple.id);

  // 3. Check if an existing member has the same nickname (case-insensitive) to rejoin
  const matchingUser = existingUsers.find(
    (u) => u.nickname.trim().toLowerCase() === trimmedNickname.toLowerCase()
  );

  if (matchingUser) {
    const partner = existingUsers.find((u) => u.id !== matchingUser.id) || null;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const deviceInfo = parseUserAgent(userAgent);

    const session: Session = {
      token,
      user_id: matchingUser.id,
      user_agent: userAgent ?? null,
      device_info: deviceInfo,
      last_active_at: new Date().toISOString(),
      expires_at: expiresAt
    };

    await redis.set(`sessions:${token}`, session, { ex: 30 * 24 * 60 * 60 });
    await redis.sadd(`user_sessions:${matchingUser.id}`, token);
    await redis.sadd('all_sessions', token);

    return {
      user: matchingUser,
      couple,
      partner,
      token
    };
  }

  // 4. Room full validation
  if (existingUsers.length >= 2) {
    const err = new Error('Couple code is full. If you are already a member, please enter your registered nickname.');
    (err as unknown as { status: number }).status = 409;
    throw err;
  }

  // 5. Determine slot and partner
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
  const user: User = {
    id: userId,
    couple_id: couple.id,
    nickname: trimmedNickname,
    slot,
    created_at: new Date().toISOString()
  };

  await redis.set(`users:${userId}`, user);
  await redis.sadd(`couple_users:${couple.id}`, userId);
  await redis.sadd('all_users', userId);

  // 7. Generate session token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const deviceInfo = parseUserAgent(userAgent);

  const session: Session = {
    token,
    user_id: userId,
    user_agent: userAgent ?? null,
    device_info: deviceInfo,
    last_active_at: new Date().toISOString(),
    expires_at: expiresAt
  };

  await redis.set(`sessions:${token}`, session, { ex: 30 * 24 * 60 * 60 });
  await redis.sadd(`user_sessions:${userId}`, token);
  await redis.sadd('all_sessions', token);

  return {
    user,
    couple,
    partner,
    token
  };
}

/**
 * Retrieves session, user, couple, and partner by session token.
 */
export async function getSession(token: string): Promise<SessionWithUser | null> {
  if (!token) return null;
  const redis = getRedis();

  const session = await redis.get<Session>(`sessions:${token}`);
  if (!session) return null;

  const expTime = new Date(session.expires_at).getTime();
  if (isNaN(expTime) || expTime <= Date.now()) {
    await deleteSession(token);
    return null;
  }

  // Update last_active_at
  session.last_active_at = new Date().toISOString();
  await redis.set(`sessions:${token}`, session, { ex: 30 * 24 * 60 * 60 });

  const user = await redis.get<User>(`users:${session.user_id}`);
  if (!user) return null;

  const coupleCode = await redis.get<string>(`couple_by_id:${user.couple_id}`);
  if (!coupleCode) return null;

  const couple = await redis.get<Couple>(`couples:${coupleCode}`);
  if (!couple) return null;

  const existingUsers = await getCoupleUsers(user.couple_id);
  const partner = existingUsers.find((u) => u.id !== user.id) || null;

  return {
    user,
    couple,
    partner,
    session
  };
}

/**
 * Deletes a session by token and removes from user index.
 */
export async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  const redis = getRedis();

  const session = await redis.get<Session>(`sessions:${token}`);
  if (session) {
    await redis.srem(`user_sessions:${session.user_id}`, token);
    await redis.srem('all_sessions', token);
  }
  await redis.del(`sessions:${token}`);
}

/**
 * Logs out a session and closes SSE stream.
 */
export async function logoutSession(token: string): Promise<void> {
  if (!token) return;
  closeSessionConnections(token);
  await deleteSession(token);
}

/**
 * Retrieves a user's current mood.
 */
export async function getMood(userId: string): Promise<Mood | null> {
  if (!userId) return null;
  const redis = getRedis();
  return await redis.get<Mood>(`moods:${userId}`);
}

/**
 * Sets or replaces a user's current mood.
 */
export async function setMood(
  userId: string,
  emoji: string,
  label: string,
  note?: string | null,
  colorTheme: string = 'rose'
): Promise<Mood> {
  const redis = getRedis();
  const mood: Mood = {
    user_id: userId,
    emoji,
    label,
    note: note ?? null,
    color_theme: colorTheme,
    updated_at: new Date().toISOString()
  };
  await redis.set(`moods:${userId}`, mood);
  return mood;
}

/**
 * Deletes a user's mood.
 */
export async function deleteMood(userId: string): Promise<boolean> {
  if (!userId) return false;
  const redis = getRedis();
  const deleted = await redis.del(`moods:${userId}`);
  return deleted > 0;
}

/**
 * Saves or updates a push subscription.
 */
export async function savePushSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string
): Promise<void> {
  const redis = getRedis();
  const key = `push_subs:${userId}`;
  let subs = (await redis.get<PushSubscription[]>(key)) || [];

  // Remove matching endpoint if re-subscribing
  subs = subs.filter((s) => s.endpoint !== endpoint);

  subs.push({
    id: crypto.randomUUID(),
    user_id: userId,
    endpoint,
    p256dh,
    auth,
    created_at: new Date().toISOString()
  });

  await redis.set(key, subs);
}

/**
 * Retrieves all active push subscriptions for a user.
 */
export async function getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
  if (!userId) return [];
  const redis = getRedis();
  return (await redis.get<PushSubscription[]>(`push_subs:${userId}`)) || [];
}

/**
 * Deletes a push subscription by endpoint.
 */
export async function deletePushSubscription(endpoint: string, userId?: string): Promise<void> {
  const redis = getRedis();
  if (userId) {
    const key = `push_subs:${userId}`;
    let subs = (await redis.get<PushSubscription[]>(key)) || [];
    subs = subs.filter((s) => s.endpoint !== endpoint);
    await redis.set(key, subs);
    return;
  }

  // Fallback: search all users
  const userKeys = await redis.keys('push_subs:*');
  for (const k of userKeys) {
    let subs = (await redis.get<PushSubscription[]>(k)) || [];
    const origLen = subs.length;
    subs = subs.filter((s) => s.endpoint !== endpoint);
    if (subs.length !== origLen) {
      await redis.set(k, subs);
    }
  }
}

/**
 * Retrieves custom presets for a user. Seeds defaults if none exist.
 */
export async function getUserPresets(userId: string, lang: 'th' | 'en' = 'th'): Promise<UserPreset[]> {
  if (!userId) return [];
  const redis = getRedis();
  const key = `presets:${userId}`;
  let presets = await redis.get<UserPreset[]>(key);

  if (!presets || presets.length === 0) {
    const defaults = lang === 'en' ? DEFAULT_USER_PRESETS_EN : DEFAULT_USER_PRESETS_TH;
    return defaults.map((d, idx) => ({
      id: `default-${idx}`,
      user_id: userId,
      emoji: d.emoji,
      label: d.label,
      color_theme: d.color_theme,
      sort_order: d.sort_order ?? idx,
      created_at: new Date().toISOString()
    }));
  }

  return presets.sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Replaces the custom presets for a user.
 */
export async function setUserPresets(userId: string, presets: UserPresetInput[]): Promise<UserPreset[]> {
  const redis = getRedis();
  const formatted: UserPreset[] = presets.map((p, idx) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    emoji: p.emoji,
    label: p.label,
    color_theme: p.color_theme || (p as any).colorTheme || 'rose',
    sort_order: typeof p.sort_order === 'number' ? p.sort_order : idx,
    created_at: new Date().toISOString()
  }));

  await redis.set(`presets:${userId}`, formatted);
  return formatted;
}

/**
 * Resets user presets to language defaults.
 */
export async function resetUserPresets(userId: string, lang: 'th' | 'en' = 'th'): Promise<UserPreset[]> {
  const redis = getRedis();
  await redis.del(`presets:${userId}`);
  return await getUserPresets(userId, lang);
}

/**
 * Generates a 6-digit OTP for linking a new device.
 */
export async function createDeviceLinkOtp(userId: string): Promise<{ code: string; expires_at: string }> {
  const redis = getRedis();
  // Invalidate any previous OTPs for this user
  const oldCodes = await redis.smembers(`user_otps:${userId}`);
  for (const oldCode of oldCodes) {
    await redis.del(`otps:${oldCode}`);
  }
  await redis.del(`user_otps:${userId}`);

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const otpData = {
    code,
    user_id: userId,
    expires_at: expiresAt,
    failed_attempts: 0,
    created_at: new Date().toISOString()
  };

  await redis.set(`otps:${code}`, otpData, { ex: 300 });
  await redis.sadd(`user_otps:${userId}`, code);
  return { code, expires_at: expiresAt };
}

/**
 * Verifies an OTP and creates a session for the linking device.
 */
export async function verifyDeviceLinkOtp(code: string, userAgent?: string): Promise<PairResult> {
  const cleanCode = code?.trim();
  if (!cleanCode || cleanCode.length !== 6) {
    const err = new Error('Invalid or expired code. Please check your 6-digit code.');
    (err as unknown as { status: number }).status = 404;
    throw err;
  }

  const redis = getRedis();
  const otp = await redis.get<any>(`otps:${cleanCode}`);

  if (!otp) {
    const err = new Error('Invalid or expired code. Please check your 6-digit code.');
    (err as unknown as { status: number }).status = 404;
    throw err;
  }

  if (new Date(otp.expires_at).getTime() <= Date.now()) {
    await redis.del(`otps:${cleanCode}`);
    const err = new Error('This code has expired. Please generate a new code.');
    (err as unknown as { status: number }).status = 410;
    throw err;
  }

  if ((otp.failed_attempts || 0) >= 5) {
    await redis.del(`otps:${cleanCode}`);
    const err = new Error('Too many failed attempts. Please generate a new code.');
    (err as unknown as { status: number }).status = 429;
    throw err;
  }

  // OTP verified: consume it
  await redis.del(`otps:${cleanCode}`);

  const user = await redis.get<User>(`users:${otp.user_id}`);
  if (!user) {
    const err = new Error('User not found.');
    (err as unknown as { status: number }).status = 404;
    throw err;
  }

  const coupleCode = await redis.get<string>(`couple_by_id:${user.couple_id}`);
  const couple = coupleCode ? await redis.get<Couple>(`couples:${coupleCode}`) : null;
  if (!couple) {
    const err = new Error('Couple room not found.');
    (err as unknown as { status: number }).status = 404;
    throw err;
  }

  const existingUsers = await getCoupleUsers(user.couple_id);
  const partner = existingUsers.find((u) => u.id !== user.id) || null;

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const deviceInfo = parseUserAgent(userAgent);

  const session: Session = {
    token,
    user_id: user.id,
    user_agent: userAgent ?? null,
    device_info: deviceInfo,
    last_active_at: new Date().toISOString(),
    expires_at: expiresAt
  };

  await redis.set(`sessions:${token}`, session, { ex: 30 * 24 * 60 * 60 });
  await redis.sadd(`user_sessions:${user.id}`, token);
  await redis.sadd('all_sessions', token);

  return {
    user,
    couple,
    partner,
    token
  };
}

/**
 * Records an OTP failure.
 */
export async function recordOtpFailure(code: string): Promise<void> {
  const cleanCode = code?.trim();
  if (!cleanCode) return;
  const redis = getRedis();
  const otp = await redis.get<any>(`otps:${cleanCode}`);
  if (otp) {
    otp.failed_attempts = (otp.failed_attempts || 0) + 1;
    await redis.set(`otps:${cleanCode}`, otp, { ex: 300 });
  }
}

/**
 * Creates an admin session.
 */
export async function createAdminSession(): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const redis = getRedis();

  const session: AdminSession = {
    token,
    created_at: new Date().toISOString(),
    expires_at: expiresAt
  };

  await redis.set(`admin_sessions:${token}`, session, { ex: 24 * 60 * 60 });
  return token;
}

/**
 * Verifies admin session token.
 */
export async function verifyAdminSession(token: string): Promise<boolean> {
  if (!token) return false;
  const redis = getRedis();
  const session = await redis.get<AdminSession>(`admin_sessions:${token}`);
  return !!session;
}

/**
 * Deletes admin session.
 */
export async function deleteAdminSession(token: string): Promise<void> {
  if (!token) return;
  const redis = getRedis();
  await redis.del(`admin_sessions:${token}`);
}

/**
 * Checks admin login lockout.
 */
export async function checkAdminLockout(ip: string): Promise<{ locked: boolean; waitSeconds?: number }> {
  if (!ip) return { locked: false };
  const redis = getRedis();
  const row = await redis.get<{ failed_attempts: number; locked_until: string | null }>(`admin_lockout:${ip}`);
  if (!row || !row.locked_until) return { locked: false };

  const lockedTime = new Date(row.locked_until).getTime();
  const now = Date.now();
  if (lockedTime > now) {
    return {
      locked: true,
      waitSeconds: Math.ceil((lockedTime - now) / 1000)
    };
  }

  await redis.del(`admin_lockout:${ip}`);
  return { locked: false };
}

/**
 * Records failed admin login attempt.
 */
export async function recordAdminFailedAttempt(ip: string): Promise<{ locked: boolean; waitSeconds?: number; attemptsLeft: number }> {
  if (!ip) return { locked: false, attemptsLeft: MAX_ADMIN_FAILED_ATTEMPTS };
  const redis = getRedis();
  const row = await redis.get<{ failed_attempts: number; locked_until: string | null }>(`admin_lockout:${ip}`);
  const currentAttempts = (row?.failed_attempts ?? 0) + 1;

  if (currentAttempts >= MAX_ADMIN_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + ADMIN_LOCKOUT_MS).toISOString();
    await redis.set(
      `admin_lockout:${ip}`,
      { failed_attempts: currentAttempts, locked_until: lockedUntil },
      { ex: Math.ceil(ADMIN_LOCKOUT_MS / 1000) }
    );
    return {
      locked: true,
      waitSeconds: Math.ceil(ADMIN_LOCKOUT_MS / 1000),
      attemptsLeft: 0
    };
  }

  await redis.set(`admin_lockout:${ip}`, { failed_attempts: currentAttempts, locked_until: null }, { ex: 3600 });
  return {
    locked: false,
    attemptsLeft: MAX_ADMIN_FAILED_ATTEMPTS - currentAttempts
  };
}

/**
 * Resets admin failed attempts.
 */
export async function resetAdminFailedAttempts(ip: string): Promise<void> {
  if (!ip) return;
  const redis = getRedis();
  await redis.del(`admin_lockout:${ip}`);
}

/**
 * Checks room join lockout.
 */
export async function checkRoomJoinLockout(ip: string, code: string): Promise<{ locked: boolean; waitSeconds?: number }> {
  if (!ip || !code) return { locked: false };
  const key = `room_join_lockout:${ip.trim()}:${code.trim().toUpperCase()}`;
  const redis = getRedis();
  const row = await redis.get<{ failed_attempts: number; locked_until: string | null }>(key);
  if (!row || !row.locked_until) return { locked: false };

  const lockedTime = new Date(row.locked_until).getTime();
  const now = Date.now();
  if (lockedTime > now) {
    return {
      locked: true,
      waitSeconds: Math.ceil((lockedTime - now) / 1000)
    };
  }

  await redis.del(key);
  return { locked: false };
}

/**
 * Records failed room join attempt.
 */
export async function recordRoomJoinFailedAttempt(ip: string, code: string): Promise<{ locked: boolean; waitSeconds?: number; attemptsLeft: number }> {
  if (!ip || !code) return { locked: false, attemptsLeft: MAX_ROOM_JOIN_FAILED_ATTEMPTS };
  const key = `room_join_lockout:${ip.trim()}:${code.trim().toUpperCase()}`;
  const redis = getRedis();
  const row = await redis.get<{ failed_attempts: number; locked_until: string | null }>(key);
  const currentAttempts = (row?.failed_attempts ?? 0) + 1;

  if (currentAttempts >= MAX_ROOM_JOIN_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + ROOM_JOIN_LOCKOUT_MS).toISOString();
    await redis.set(
      key,
      { failed_attempts: currentAttempts, locked_until: lockedUntil },
      { ex: Math.ceil(ROOM_JOIN_LOCKOUT_MS / 1000) }
    );
    return {
      locked: true,
      waitSeconds: Math.ceil(ROOM_JOIN_LOCKOUT_MS / 1000),
      attemptsLeft: 0
    };
  }

  await redis.set(key, { failed_attempts: currentAttempts, locked_until: null }, { ex: 3600 });
  return {
    locked: false,
    attemptsLeft: MAX_ROOM_JOIN_FAILED_ATTEMPTS - currentAttempts
  };
}

/**
 * Resets failed room join attempts.
 */
export async function resetRoomJoinFailedAttempts(ip: string, code: string): Promise<void> {
  if (!ip || !code) return;
  const key = `room_join_lockout:${ip.trim()}:${code.trim().toUpperCase()}`;
  const redis = getRedis();
  await redis.del(key);
}

/**
 * Verifies admin password.
 */
export function verifyAdminPassword(password: string): boolean {
  if (typeof password !== 'string') return false;
  const expectedPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const bufA = Buffer.from(password);
  const bufB = Buffer.from(expectedPassword);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Retrieves all active sessions for admin dashboard.
 */
export async function getAllSessionsWithDetails(): Promise<AdminSessionDetail[]> {
  const redis = getRedis();
  const tokens = await redis.smembers('all_sessions');
  const details: AdminSessionDetail[] = [];

  for (const token of tokens) {
    const session = await redis.get<Session>(`sessions:${token}`);
    if (!session) {
      await redis.srem('all_sessions', token);
      continue;
    }

    const user = await redis.get<User>(`users:${session.user_id}`);
    let coupleCode = 'UNKNOWN';
    if (user) {
      const cCode = await redis.get<string>(`couple_by_id:${user.couple_id}`);
      if (cCode) coupleCode = cCode;
    }

    details.push({
      token: session.token,
      token_preview: session.token.slice(0, 8) + '...' + session.token.slice(-6),
      user_id: session.user_id,
      user_nickname: user?.nickname || 'Unknown',
      user_slot: user?.slot || 1,
      couple_id: user?.couple_id || '',
      couple_code: coupleCode,
      device_info: session.device_info || 'Unknown Device',
      user_agent: session.user_agent ?? null,
      created_at: session.expires_at, // Approximate/persisted
      last_active_at: session.last_active_at || session.expires_at,
      is_online: isTokenOnline(session.token)
    });
  }

  return details;
}

/**
 * Computes admin metrics.
 */
export async function getAdminStats(): Promise<AdminStats> {
  const redis = getRedis();
  const totalCouples = await redis.scard('all_couples');
  const totalUsers = await redis.scard('all_users');
  const totalSessions = await redis.scard('all_sessions');
  const liveConnections = getConnectionCount();

  return {
    total_couples: totalCouples,
    total_users: totalUsers,
    total_sessions: totalSessions,
    live_connections: liveConnections
  };
}

/**
 * Revokes a session token.
 */
export async function revokeSession(token: string): Promise<boolean> {
  if (!token) return false;
  closeSessionConnections(token);
  await deleteSession(token);
  return true;
}

/**
 * Revokes all sessions for a user.
 */
export async function revokeSessionsByUser(userId: string): Promise<number> {
  if (!userId) return 0;
  closeUserConnections(userId);
  const redis = getRedis();
  const tokens = await redis.smembers(`user_sessions:${userId}`);
  for (const t of tokens) {
    await deleteSession(t);
  }
  return tokens.length;
}

/**
 * Revokes all sessions in a couple room.
 */
export async function revokeSessionsByCouple(coupleId: string): Promise<number> {
  if (!coupleId) return 0;
  const userIds = await getRedis().smembers(`couple_users:${coupleId}`);
  let count = 0;
  for (const uid of userIds) {
    count += await revokeSessionsByUser(uid);
  }
  return count;
}

/**
 * Revokes all sessions system-wide.
 */
export async function revokeAllSessions(): Promise<number> {
  closeAllConnections();
  const redis = getRedis();
  const tokens = await redis.smembers('all_sessions');
  for (const t of tokens) {
    await deleteSession(t);
  }
  return tokens.length;
}

/**
 * Retrieves all couple rooms with details for admin dashboard.
 */
export async function getAllCouplesWithDetails(): Promise<AdminCoupleDetail[]> {
  const redis = getRedis();
  const coupleIds = await redis.smembers('all_couples');
  const details: AdminCoupleDetail[] = [];

  for (const cid of coupleIds) {
    const code = await redis.get<string>(`couple_by_id:${cid}`);
    if (!code) continue;
    const couple = await redis.get<Couple>(`couples:${code}`);
    if (!couple) continue;

    const users = await getCoupleUsers(cid);
    const members: AdminCoupleMember[] = [];
    let totalActiveSessions = 0;

    for (const u of users) {
      const mood = await redis.get<Mood>(`moods:${u.id}`);
      const userSessions = await redis.scard(`user_sessions:${u.id}`);
      totalActiveSessions += userSessions;

      members.push({
        id: u.id,
        nickname: u.nickname,
        slot: u.slot,
        created_at: u.created_at || '',
        mood: mood ? { emoji: mood.emoji, label: mood.label, note: mood.note, updated_at: mood.updated_at } : null
      });
    }

    details.push({
      id: couple.id,
      code: couple.code,
      created_at: couple.created_at || '',
      members,
      active_sessions_count: totalActiveSessions
    });
  }

  return details;
}

/**
 * Permanently deletes a couple room and cascades to all users, sessions, moods, presets, etc.
 */
export async function deleteCouple(coupleId: string): Promise<boolean> {
  if (!coupleId) return false;
  const redis = getRedis();

  const code = await redis.get<string>(`couple_by_id:${coupleId}`);
  const userIds = await redis.smembers(`couple_users:${coupleId}`);

  // Disconnect all clients in this couple
  for (const uid of userIds) {
    closeUserConnections(uid);
    // Remove user sessions
    const tokens = await redis.smembers(`user_sessions:${uid}`);
    for (const t of tokens) {
      await redis.del(`sessions:${t}`);
      await redis.srem('all_sessions', t);
    }
    await redis.del(`user_sessions:${uid}`);
    await redis.del(`moods:${uid}`);
    await redis.del(`presets:${uid}`);
    await redis.del(`push_subs:${uid}`);
    await redis.del(`users:${uid}`);
    await redis.srem('all_users', uid);
  }

  await redis.del(`couple_users:${coupleId}`);
  if (code) {
    await redis.del(`couples:${code}`);
  }
  await redis.del(`couple_by_id:${coupleId}`);
  await redis.srem('all_couples', coupleId);

  return true;
}
