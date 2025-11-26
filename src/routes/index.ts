import { Router } from 'express';
import authRoutes from './auth.routes.js';
import feedsRoutes from './feeds.routes.js';
import entriesRoutes from './entries.routes.js';
import categoriesRoutes from './categories.routes.js';
import usersRoutes from './users.routes.js';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
router.use('/auth', authRoutes);
router.use('/feeds', feedsRoutes);
router.use('/entries', entriesRoutes);
router.use('/categories', categoriesRoutes);
router.use('/users', usersRoutes);

export default router;

