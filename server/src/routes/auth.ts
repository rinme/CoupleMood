import { Router } from 'express';
import {
  pairUser,
  deleteSession,
  logoutSession,
  checkRoomJoinLockout,
  recordRoomJoinFailedAttempt,
  resetRoomJoinFailedAttempts
} from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

/**
 * POST /api/auth/pair
 * Pairs user to couple room and issues HTTP-only session cookie.
 * Supports rejoining as an existing member using their nickname.
 * Includes brute-force protection for guessing member names in full rooms.
 */
authRouter.post('/pair', async (req, res) => {
  const { code, nickname } = req.body ?? {};

  if (!code || typeof code !== 'string' || !code.trim()) {
    res.status(400).json({ error: 'Couple code is required' });
    return;
  }

  if (!nickname || typeof nickname !== 'string' || !nickname.trim()) {
    res.status(400).json({ error: 'Nickname is required' });
    return;
  }

  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';

  // Check lockout
  const lockout = await checkRoomJoinLockout(clientIp, code);
  if (lockout.locked) {
    res.status(429).json({
      error: `Too many failed join attempts for this room. Please wait ${lockout.waitSeconds} seconds.`,
      waitSeconds: lockout.waitSeconds
    });
    return;
  }

  try {
    const userAgent = req.headers['user-agent'];
    const result = await pairUser(code, nickname, userAgent);

    // Reset failed attempts on successful join or rejoin
    await resetRoomJoinFailedAttempts(clientIp, code);

    // 30 days expiration for session cookie
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    res.cookie('mood_session', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: THIRTY_DAYS_MS
    });

    res.status(200).json({
      user: result.user,
      couple: result.couple,
      partner: result.partner
    });
  } catch (err: any) {
    if (err?.status === 409 || err?.message?.includes('Couple code is full')) {
      const attemptResult = await recordRoomJoinFailedAttempt(clientIp, code);
      if (attemptResult.locked) {
        res.status(429).json({
          error: `Too many failed join attempts for this room. Please wait ${attemptResult.waitSeconds} seconds.`,
          waitSeconds: attemptResult.waitSeconds
        });
        return;
      }
      res.status(409).json({
        error: 'Couple code is full. If you are already a member, please enter your registered nickname.'
      });
      return;
    }
    res.status(400).json({ error: err?.message || 'Failed to pair' });
  }
});

/**
 * GET /api/auth/session
 * Validates session cookie and returns user/partner info.
 */
authRouter.get('/session', requireAuth, (req, res) => {
  res.status(200).json({
    user: req.user,
    couple: req.couple,
    partner: req.partner
  });
});

/**
 * POST /api/auth/unpair
 * Deletes session and clears session cookie.
 */
authRouter.post('/unpair', async (req, res) => {
  const token = req.cookies?.mood_session;
  if (token) {
    await deleteSession(token);
  }

  res.clearCookie('mood_session', { path: '/' });
  res.status(200).json({ success: true });
});

/**
 * POST /api/auth/logout
 * Logs out current device session and clears session cookie.
 */
authRouter.post('/logout', requireAuth, async (req, res) => {
  const token = req.cookies?.mood_session || req.sessionToken;
  if (token) {
    await logoutSession(token);
  }

  res.clearCookie('mood_session', { path: '/', maxAge: 0 });
  res.status(200).json({ message: 'Logged out from this device' });
});

