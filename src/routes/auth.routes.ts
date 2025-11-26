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
 * Login with username and password (returns user info, auth via Basic Auth)
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
      const user = await AuthService.login(username, password);

      res.json({
        success: true,
        data: { user },
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

      // Check if any users exist
      const userCount = UserModel.count();
      const isFirstUser = userCount === 0;

      if (!isFirstUser) {
        // Registration is only allowed for first user or by admin
        // For now, we'll only allow first user registration
        throw new ValidationError('Registration is disabled. Please contact an administrator.');
      }

      const user = await AuthService.register(
        username,
        password,
        isFirstUser // First user becomes admin
      );

      res.status(201).json({
        success: true,
        data: { user },
        message: isFirstUser ? 'Admin account created successfully' : 'Account created successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/auth/me
 * Get current user info (requires Basic Auth)
 */
router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json({
    success: true,
    data: UserModel.toPublic(req.user!),
  });
});

/**
 * POST /api/auth/change-password
 * Change current user's password (requires Basic Auth)
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
