import { Router, Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { CategoryService } from '../services/category.service.js';
import { FeedModel } from '../models/feed.model.js';
import { authenticate } from '../middlewares/auth.middleware.js';
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
 * GET /api/categories
 * Get all categories for current user
 */
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = CategoryService.getCategories(req.user!.id);
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/categories/:id
 * Get a specific category
 */
router.get(
  '/:id',
  [param('id').isInt().withMessage('Invalid category ID'), handleValidation],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const categoryId = parseInt(req.params.id, 10);
      const category = CategoryService.getCategory(categoryId, req.user!.id);
      res.json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/categories/:id/feeds
 * Get all feeds in a category
 */
router.get(
  '/:id/feeds',
  [param('id').isInt().withMessage('Invalid category ID'), handleValidation],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const categoryId = parseInt(req.params.id, 10);
      // Verify category belongs to user
      CategoryService.getCategory(categoryId, req.user!.id);
      
      const feeds = FeedModel.findByCategoryId(categoryId, req.user!.id);
      res.json({ success: true, data: feeds });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/categories
 * Create a new category
 */
router.post(
  '/',
  [
    body('title')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Title must be between 1 and 100 characters'),
    handleValidation,
  ],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title } = req.body;
      const category = CategoryService.createCategory(req.user!.id, { title });
      res.status(201).json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/categories/:id
 * Update a category
 */
router.put(
  '/:id',
  [
    param('id').isInt().withMessage('Invalid category ID'),
    body('title')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Title must be between 1 and 100 characters'),
    handleValidation,
  ],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const categoryId = parseInt(req.params.id, 10);
      const { title } = req.body;

      const category = CategoryService.updateCategory(categoryId, req.user!.id, { title });
      res.json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/categories/:id
 * Delete a category (feeds are moved to first remaining category)
 */
router.delete(
  '/:id',
  [param('id').isInt().withMessage('Invalid category ID'), handleValidation],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const categoryId = parseInt(req.params.id, 10);
      CategoryService.deleteCategory(categoryId, req.user!.id);
      res.json({ success: true, message: 'Category deleted' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

