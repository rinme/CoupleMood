import type { Request, Response, NextFunction } from 'express';
import { verifyAdminSession } from '../db.js';

declare global {
  namespace Express {
    interface Request {
      adminToken?: string;
    }
  }
}

/**
 * Authentication middleware verifying 'admin_session' HTTP-only cookie.
 * Returns 401 if missing, invalid, or expired.
 */
export async function requireAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.admin_session;

  if (!token) {
    res.status(401).json({ error: 'Admin unauthorized' });
    return;
  }

  const isValid = await verifyAdminSession(token);
  if (!isValid) {
    res.clearCookie('admin_session', { path: '/' });
    res.status(401).json({ error: 'Admin unauthorized' });
    return;
  }

  req.adminToken = token;
  next();
}
