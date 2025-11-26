import { Router, Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { FeedService } from '../services/feed.service.js';
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
 * GET /api/feeds
 * Get all feeds for current user
 */
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const feeds = FeedService.getFeeds(req.user!.id);
    res.json({ success: true, data: feeds });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/feeds/:id
 * Get a specific feed
 */
router.get(
  '/:id',
  [param('id').isInt().withMessage('Invalid feed ID'), handleValidation],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const feedId = parseInt(req.params.id, 10);
      const feed = FeedService.getFeed(feedId, req.user!.id);
      
      if (!feed) {
        res.status(404).json({ success: false, error: 'Feed not found' });
        return;
      }

      res.json({ success: true, data: feed });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/feeds
 * Subscribe to a new feed
 */
router.post(
  '/',
  [
    body('feed_url').trim().isURL().withMessage('Valid feed URL is required'),
    body('category_id').optional().isInt().withMessage('Invalid category ID'),
    body('title').optional().trim().isLength({ max: 200 }).withMessage('Title too long'),
    handleValidation,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { feed_url, category_id, title } = req.body;

      const result = await FeedService.subscribe(req.user!.id, {
        feed_url,
        category_id: category_id ? parseInt(category_id, 10) : undefined,
        title,
      });

      res.status(201).json({
        success: true,
        data: result.feed,
        message: `Subscribed to feed with ${result.entriesCreated} entries`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/feeds/:id
 * Update a feed
 */
router.put(
  '/:id',
  [
    param('id').isInt().withMessage('Invalid feed ID'),
    body('title').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Invalid title'),
    body('category_id').optional().isInt().withMessage('Invalid category ID'),
    handleValidation,
  ],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const feedId = parseInt(req.params.id, 10);
      const { title, category_id } = req.body;

      const feed = FeedService.updateFeed(feedId, req.user!.id, {
        title,
        category_id: category_id ? parseInt(category_id, 10) : undefined,
      });

      res.json({ success: true, data: feed });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/feeds/:id
 * Unsubscribe from a feed
 */
router.delete(
  '/:id',
  [param('id').isInt().withMessage('Invalid feed ID'), handleValidation],
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const feedId = parseInt(req.params.id, 10);
      FeedService.deleteFeed(feedId, req.user!.id);
      res.json({ success: true, message: 'Feed deleted' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/feeds/:id/refresh
 * Manually refresh a specific feed
 */
router.post(
  '/:id/refresh',
  [param('id').isInt().withMessage('Invalid feed ID'), handleValidation],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const feedId = parseInt(req.params.id, 10);
      
      // Verify feed belongs to user
      const existingFeed = FeedService.getFeed(feedId, req.user!.id);
      if (!existingFeed) {
        res.status(404).json({ success: false, error: 'Feed not found' });
        return;
      }

      const result = await FeedService.refreshFeed(feedId);

      res.json({
        success: result.success,
        data: result.feed,
        message: result.success
          ? `Refreshed: ${result.newEntries} new entries`
          : `Refresh failed: ${result.error}`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/feeds/refresh-all
 * Refresh all feeds for current user (triggers immediate refresh of due feeds)
 */
router.post('/refresh-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await FeedService.refreshDueFeeds();
    res.json({
      success: true,
      data: result,
      message: `Refreshed ${result.refreshed} feeds (${result.errors} errors)`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

