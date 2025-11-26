import { Request, Response, NextFunction } from 'express';
import { SessionModel } from '../models/session.model.js';
import { UserModel } from '../models/user.model.js';
import type { User } from '../types/index.js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionToken?: string;
    }
  }
}

/**
 * Middleware to authenticate requests using session token
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  // Check for session in cookie or Authorization header
  const sessionToken = 
    req.session?.userId ? null : // Express session already has user
    req.headers.authorization?.replace('Bearer ', '') ||
    req.cookies?.session_token;

  // If using express-session
  if (req.session?.userId) {
    const user = UserModel.findById(req.session.userId);
    if (user) {
      req.user = user;
      return next();
    }
    // Session invalid, destroy it
    req.session.destroy(() => {});
    res.status(401).json({ success: false, error: 'Session expired' });
    return;
  }

  // If using token-based auth
  if (sessionToken) {
    const session = SessionModel.findByToken(sessionToken);
    if (session) {
      const user = UserModel.findById(session.user_id);
      if (user) {
        req.user = user;
        req.sessionToken = sessionToken;
        return next();
      }
    }
  }

  res.status(401).json({ success: false, error: 'Authentication required' });
}

/**
 * Middleware to require admin role
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  if (!req.user.is_admin) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }

  next();
}

/**
 * Optional authentication - sets user if authenticated but doesn't require it
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const sessionToken = 
    req.headers.authorization?.replace('Bearer ', '') ||
    req.cookies?.session_token;

  if (req.session?.userId) {
    const user = UserModel.findById(req.session.userId);
    if (user) {
      req.user = user;
    }
  } else if (sessionToken) {
    const session = SessionModel.findByToken(sessionToken);
    if (session) {
      const user = UserModel.findById(session.user_id);
      if (user) {
        req.user = user;
        req.sessionToken = sessionToken;
      }
    }
  }

  next();
}

export default { authenticate, requireAdmin, optionalAuth };

