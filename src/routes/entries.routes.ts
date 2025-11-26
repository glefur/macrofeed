import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { EntryService } from '../services/entry.service.js';
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
 * GET /api/entries
 * Get entries with filters and pagination
 */
router.get(
  '/',
  [
    query('starred').optional().isBoolean().withMessage('Invalid starred value'),
    query('feed_id').optional().isInt().withMessage('Invalid feed ID'),
    query('category_id').optional().isInt().withMessage('Invalid category ID'),
    query('search').optional().isString(),
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
    query('order_by').optional().isIn(['published_at', 'created_at']).withMessage('Invalid order_by'),
    query('order_dir').optional().isIn(['asc', 'desc']).withMessage('Invalid order_dir'),
    handleValidation,
  ],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const options = {
        starred: req.query.starred === 'true' ? true : req.query.starred === 'false' ? false : undefined,
        feed_id: req.query.feed_id ? parseInt(req.query.feed_id as string, 10) : undefined,
        category_id: req.query.category_id ? parseInt(req.query.category_id as string, 10) : undefined,
        search: req.query.search as string | undefined,
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        order_by: req.query.order_by as 'published_at' | 'created_at' | undefined,
        order_dir: req.query.order_dir as 'asc' | 'desc' | undefined,
      };

      const result = EntryService.getEntries(req.user!.id, options);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/entries/starred
 * Get starred entries
 */
router.get('/starred', (req: Request, res: Response, next: NextFunction) => {
  try {
    const options = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const result = EntryService.getStarredEntries(req.user!.id, options);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/entries/counts
 * Get entry counts
 */
router.get('/counts', (req: Request, res: Response, next: NextFunction) => {
  try {
    const counts = EntryService.getCounts(req.user!.id);
    res.json({ success: true, data: counts });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/entries/:id
 * Get a single entry
 */
router.get(
  '/:id',
  [param('id').isInt().withMessage('Invalid entry ID'), handleValidation],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const entryId = parseInt(req.params.id, 10);
      const result = EntryService.getEntryWithEnclosures(entryId, req.user!.id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/entries/:id/star
 * Toggle starred status
 */
router.post(
  '/:id/star',
  [param('id').isInt().withMessage('Invalid entry ID'), handleValidation],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const entryId = parseInt(req.params.id, 10);
      const entry = EntryService.toggleStarred(entryId, req.user!.id);
      res.json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/entries/:id/star
 * Set starred status
 */
router.put(
  '/:id/star',
  [
    param('id').isInt().withMessage('Invalid entry ID'),
    body('starred').isBoolean().withMessage('starred must be a boolean'),
    handleValidation,
  ],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const entryId = parseInt(req.params.id, 10);
      const { starred } = req.body;
      const entry = EntryService.setStarred(entryId, req.user!.id, starred);
      res.json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/entries/:id/fetch-content
 * Fetch full article content using Readability
 */
router.post(
  '/:id/fetch-content',
  [param('id').isInt().withMessage('Invalid entry ID'), handleValidation],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entryId = parseInt(req.params.id, 10);
      const entry = await EntryService.fetchFullContent(entryId, req.user!.id);
      res.json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

