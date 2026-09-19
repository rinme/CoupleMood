import { Router } from 'express';
import { createDeviceLinkOtp, verifyDeviceLinkOtp, recordOtpFailure } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const deviceLinkRouter = Router();

/**
 * POST /api/auth/device-link/create
 * Authenticated endpoint generating a 6-digit OTP and QR link for device linking.
 */
deviceLinkRouter.post('/create', requireAuth, (req, res) => {
  try {
    const { code, expiresAt } = createDeviceLinkOtp(req.user.id);
    const host = req.get('host') || 'localhost';
    const qrUrl = `${req.protocol}://${host}/link?code=${code}`;

    res.status(200).json({
      code,
      expiresAt,
      qrUrl
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to create device link OTP' });
  }
});

/**
 * POST /api/auth/device-link/verify
 * Public endpoint verifying a 6-digit OTP and issuing a session cookie.
 */
deviceLinkRouter.post('/verify', (req, res) => {
  const { code } = req.body ?? {};

  const rawCode = typeof code === 'number' ? String(code) : (typeof code === 'string' ? code.trim() : '');

  if (!rawCode || !/^\d{6}$/.test(rawCode)) {
    res.status(400).json({ error: 'Valid 6-digit code is required' });
    return;
  }

  try {
    const userAgent = req.headers['user-agent'];
    const result = verifyDeviceLinkOtp(rawCode, userAgent);

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
    recordOtpFailure(rawCode);
    const status = typeof err?.status === 'number' ? err.status : 400;
    res.status(status).json({ error: err?.message || 'Failed to verify code' });
  }
});
