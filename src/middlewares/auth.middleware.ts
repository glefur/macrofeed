import { Request, Response, NextFunction } from 'express';
import { UserModel } from '../models/user.model.js';
import type { User } from '../types/index.js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Middleware to authenticate requests using HTTP Basic Auth
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    res.setHeader('WWW-Authenticate', 'Basic realm="Macrofeed"');
    return;
  }

  // Decode Basic Auth credentials
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');

  if (!username || !password) {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
    res.setHeader('WWW-Authenticate', 'Basic realm="Macrofeed"');
    return;
  }

  // Find user and verify password
  const user = UserModel.findByUsername(username);
  if (!user) {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
    res.setHeader('WWW-Authenticate', 'Basic realm="Macrofeed"');
    return;
  }

  // Verify password (async, but we'll handle it synchronously for now)
  UserModel.verifyPassword(user, password)
    .then((isValid) => {
      if (!isValid) {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
        res.setHeader('WWW-Authenticate', 'Basic realm="Macrofeed"');
        return;
      }

      // Update last login
      UserModel.updateLastLogin(user.id);
      req.user = user;
      next();
    })
    .catch(() => {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      res.setHeader('WWW-Authenticate', 'Basic realm="Macrofeed"');
    });
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
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    if (username && password) {
      const user = UserModel.findByUsername(username);
      if (user) {
        UserModel.verifyPassword(user, password)
          .then((isValid) => {
            if (isValid) {
              req.user = user;
            }
            next();
          })
          .catch(() => next());
        return;
      }
    }
  }

  next();
}

export default { authenticate, requireAdmin, optionalAuth };
