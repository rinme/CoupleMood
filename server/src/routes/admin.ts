import { Router } from 'express';
import {
  verifyAdminPassword,
  checkAdminLockout,
  recordAdminFailedAttempt,
  resetAdminFailedAttempts,
  createAdminSession,
  deleteAdminSession,
  getAllSessionsWithDetails,
  getAdminStats,
  revokeSession,
  revokeSessionsByCouple,
  revokeAllSessions,
  getAllCouplesWithDetails,
  deleteCouple
} from '../db.js';
import { requireAdminAuth } from '../middleware/adminAuth.js';

export const adminRouter = Router();

/**
 * Extracts a normalized client IP string for brute-force tracking.
 */
function getClientIp(req: any): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * POST /api/admin/login
 * Validates admin password, handles brute-force lockout, and issues an HTTP-only admin_session cookie.
 */
adminRouter.post('/login', async (req, res) => {
  const ip = getClientIp(req);
  const { password } = req.body ?? {};

  // Check if IP is currently locked out
  const lockoutStatus = await checkAdminLockout(ip);
  if (lockoutStatus.locked) {
    res.status(429).json({
      error: 'Too many failed login attempts. Locked out for 15 minutes.',
      locked: true,
      waitSeconds: lockoutStatus.waitSeconds
    });
    return;
  }

  if (typeof password !== 'string' || !password) {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  const isValid = verifyAdminPassword(password);
  if (!isValid) {
    const attempt = await recordAdminFailedAttempt(ip);
    if (attempt.locked) {
      res.status(429).json({
        error: 'Too many failed login attempts. Locked out for 15 minutes.',
        locked: true,
        waitSeconds: attempt.waitSeconds
      });
      return;
    }

    res.status(401).json({
      error: 'Incorrect password',
      attemptsLeft: attempt.attemptsLeft
    });
    return;
  }

  // Password correct: reset failed attempts counter for this IP
  await resetAdminFailedAttempts(ip);

  // Issue admin session token (24h validity)
  const token = await createAdminSession();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  res.cookie('admin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ONE_DAY_MS
  });

  res.status(200).json({ success: true });
});

/**
 * POST /api/admin/logout
 * Destroys the admin session and clears the admin_session cookie.
 */
adminRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.admin_session;
  if (token) {
    await deleteAdminSession(token);
  }

  res.clearCookie('admin_session', { path: '/' });
  res.status(200).json({ success: true });
});

/**
 * GET /api/admin/check
 * Returns whether the current client holds an authenticated admin session.
 */
adminRouter.get('/check', requireAdminAuth, (_req, res) => {
  res.status(200).json({ authenticated: true });
});

/**
 * GET /api/admin/stats
 * Overview metrics: couples, users, sessions, and live SSE connections.
 */
adminRouter.get('/stats', requireAdminAuth, async (_req, res) => {
  const stats = await getAdminStats();
  res.status(200).json(stats);
});

/**
 * GET /api/admin/sessions
 * List of all current sessions with parsed device, user, couple, and real-time status.
 */
adminRouter.get('/sessions', requireAdminAuth, async (_req, res) => {
  const sessions = await getAllSessionsWithDetails();
  res.status(200).json({ sessions });
});

/**
 * DELETE /api/admin/sessions/:token
 * Revokes a specific session token and terminates any active SSE connection.
 */
adminRouter.delete('/sessions/:token', requireAdminAuth, async (req, res) => {
  const { token } = req.params;
  const revoked = await revokeSession(token);
  res.status(200).json({ success: revoked, token });
});

/**
 * DELETE /api/admin/couples/:coupleId/sessions
 * Revokes all sessions belonging to users in a couple.
 */
adminRouter.delete('/couples/:coupleId/sessions', requireAdminAuth, async (req, res) => {
  const { coupleId } = req.params;
  const count = await revokeSessionsByCouple(coupleId);
  res.status(200).json({ success: true, revokedCount: count });
});

/**
 * GET /api/admin/couples
 * List of all couple rooms with member nicknames, slots, current moods, and active session counts.
 */
adminRouter.get('/couples', requireAdminAuth, async (_req, res) => {
  const couples = await getAllCouplesWithDetails();
  res.status(200).json({ couples });
});

/**
 * DELETE /api/admin/couples/:coupleId
 * Permanently deletes a couple room and cascades to all users, sessions, moods, presets, and tokens.
 */
adminRouter.delete('/couples/:coupleId', requireAdminAuth, async (req, res) => {
  const { coupleId } = req.params;
  const deleted = await deleteCouple(coupleId);
  res.status(200).json({ success: deleted, coupleId });
});

/**
 * DELETE /api/admin/sessions
 * Purges ALL sessions system-wide.
 */
adminRouter.delete('/sessions', requireAdminAuth, async (_req, res) => {
  const count = await revokeAllSessions();
  res.status(200).json({ success: true, revokedCount: count });
});
