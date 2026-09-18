import type { Request, Response, NextFunction } from 'express';
import { getSession } from '../db.js';
import type { User, Couple } from '../types.js';

declare global {
  namespace Express {
    interface Request {
      user: User;
      couple: Couple;
      partner: User | null;
      sessionToken: string;
    }
  }
}

/**
 * Authentication middleware verifying 'mood_session' HTTP-only cookie.
 * Attaches user, couple, and partner to Request if valid, returns 401 otherwise.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.mood_session;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const session = getSession(token);
  if (!session) {
    res.clearCookie('mood_session', { path: '/' });
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  req.user = session.user;
  req.couple = session.couple;
  req.partner = session.partner;
  req.sessionToken = token;

  next();
}
