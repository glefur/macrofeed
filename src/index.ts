import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { config } from './config/index.js';
import logger from './utils/logger.js';
import { getDatabase, closeDatabase } from './database/index.js';
import { migrate } from './database/migrate.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import routes from './routes/index.js';
import { startScheduler, stopScheduler } from './scheduler/index.js';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: config.isProd,
}));

// CORS
app.use(cors({
  origin: config.isDev ? true : process.env.CORS_ORIGIN,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Cookie parser
app.use(cookieParser());

// Request logging in development
if (config.isDev) {
  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });
}

// API routes
app.use('/api', routes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Graceful shutdown handler
function gracefulShutdown(signal: string): void {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  stopScheduler();
  closeDatabase();
  
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
async function start(): Promise<void> {
  try {
    // Initialize database
    logger.info('Initializing database...');
    getDatabase();
    
    // Run migrations
    logger.info('Running migrations...');
    await migrate();

    // Start scheduler
    startScheduler();

    // Start HTTP server
    app.listen(config.port, () => {
      logger.info(`🚀 Macrofeed API server running on port ${config.port}`);
      logger.info(`   Environment: ${config.nodeEnv}`);
      logger.info(`   Database: ${config.databasePath}`);
      logger.info(`   API: http://localhost:${config.port}/api`);
      logger.info(`   Health: http://localhost:${config.port}/api/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;

