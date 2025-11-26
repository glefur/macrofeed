import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { AuthService } from '../services/auth.service.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { ValidationError } from '../middlewares/error.middleware.js';
import { UserModel } from '../models/user.model.js';

const router = Router();

// Validation middleware
const handleValidation = (req: Request, _res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError(errors.array().map(e => e.msg).join(', '));
  }
  next();
};

/**
 * POST /api/auth/login
 * Login with username and password
 */
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidation,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, password } = req.body;
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await AuthService.login(username, password, userAgent, ipAddress);

      // Set session cookie
      res.cookie('session_token', result.session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      res.json({
        success: true,
        data: {
          user: result.user,
          token: result.session.token,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/register
 * Register a new user (only if no users exist, or if admin)
 */
router.post(
  '/register',
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    handleValidation,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, password } = req.body;
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      // Check if any users exist
      const userCount = UserModel.count();
      const isFirstUser = userCount === 0;

      if (!isFirstUser) {
        // Registration is only allowed for first user or by admin
        // For now, we'll only allow first user registration
        throw new ValidationError('Registration is disabled. Please contact an administrator.');
      }

      const result = await AuthService.register(
        username,
        password,
        userAgent,
        ipAddress,
        isFirstUser // First user becomes admin
      );

      // Set session cookie
      res.cookie('session_token', result.session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        success: true,
        data: {
          user: result.user,
          token: result.session.token,
        },
        message: isFirstUser ? 'Admin account created successfully' : 'Account created successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/auth/logout
 * Logout current session
 */
router.post('/logout', authenticate, (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionToken = req.sessionToken || req.cookies?.session_token;
    
    if (sessionToken) {
      AuthService.logout(sessionToken);
    }

    res.clearCookie('session_token');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout-all
 * Logout all sessions for current user
 */
router.post('/logout-all', authenticate, (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = AuthService.logoutAll(req.user!.id);
    res.clearCookie('session_token');
    res.json({ success: true, message: `Logged out from ${count} sessions` });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json({
    success: true,
    data: UserModel.toPublic(req.user!),
  });
});

/**
 * GET /api/auth/sessions
 * Get all active sessions for current user
 */
router.get('/sessions', authenticate, (req: Request, res: Response) => {
  const sessions = AuthService.getSessions(req.user!.id);
  res.json({
    success: true,
    data: sessions.map(s => ({
      id: s.id,
      user_agent: s.user_agent,
      ip_address: s.ip_address,
      created_at: s.created_at,
      expires_at: s.expires_at,
    })),
  });
});

/**
 * DELETE /api/auth/sessions/:sessionId
 * Delete a specific session
 */
router.delete('/sessions/:sessionId', authenticate, (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = parseInt(req.params.sessionId, 10);
    if (isNaN(sessionId)) {
      throw new ValidationError('Invalid session ID');
    }

    const deleted = AuthService.deleteSession(sessionId, req.user!.id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    res.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/change-password
 * Change current user's password
 */
router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters'),
    handleValidation,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body;
      await AuthService.changePassword(req.user!, currentPassword, newPassword);
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/auth/check
 * Check if registration is available (no users exist)
 */
router.get('/check', (_req: Request, res: Response) => {
  const userCount = UserModel.count();
  res.json({
    success: true,
    data: {
      registrationAvailable: userCount === 0,
      userCount,
    },
  });
});

export default router;

