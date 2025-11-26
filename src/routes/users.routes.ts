import { Router, Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { UserService } from '../services/user.service.js';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware.js';
import { ValidationError } from '../middlewares/error.middleware.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Validation middleware
const handleValidation = (req: Request, _res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError(errors.array().map(e => e.msg).join(', '));
  }
  next();
};

/**
 * GET /api/users
 * Get all users (admin only)
 */
router.get('/', requireAdmin, (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = UserService.getUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id
 * Get a specific user (admin only, or own user)
 */
router.get(
  '/:id',
  [param('id').isInt().withMessage('Invalid user ID'), handleValidation],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.id, 10);

      // Allow users to view their own profile
      if (userId !== req.user!.id && !req.user!.is_admin) {
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }

      const user = UserService.getUser(userId);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/users
 * Create a new user (admin only)
 */
router.post(
  '/',
  requireAdmin,
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
    body('is_admin').optional().isBoolean().withMessage('is_admin must be a boolean'),
    handleValidation,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, password, is_admin } = req.body;
      const user = await UserService.createUser({ username, password, is_admin });
      res.status(201).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/users/:id
 * Update a user
 */
router.put(
  '/:id',
  [
    param('id').isInt().withMessage('Invalid user ID'),
    body('username')
      .optional()
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
    body('is_admin').optional().isBoolean().withMessage('is_admin must be a boolean'),
    handleValidation,
  ],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.id, 10);
      const { username, is_admin } = req.body;

      const user = UserService.updateUser(userId, { username, is_admin }, req.user!);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/users/:id/password
 * Update user password (admin can update any, users can update their own)
 */
router.put(
  '/:id/password',
  [
    param('id').isInt().withMessage('Invalid user ID'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    handleValidation,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.id, 10);
      const { password } = req.body;

      await UserService.updatePassword(userId, password, req.user!);
      res.json({ success: true, message: 'Password updated' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/users/:id
 * Delete a user (admin only)
 */
router.delete(
  '/:id',
  requireAdmin,
  [param('id').isInt().withMessage('Invalid user ID'), handleValidation],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = parseInt(req.params.id, 10);
      UserService.deleteUser(userId, req.user!);
      res.json({ success: true, message: 'User deleted' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

