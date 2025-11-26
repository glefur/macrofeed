import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',

  // Database
  databasePath: process.env.DATABASE_PATH || './data/macrofeed.db',

  // Session
  sessionSecret: process.env.SESSION_SECRET || 'change-me-in-production',
  sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10), // 24 hours

  // Feed Refresh
  feedRefreshIntervalMinutes: parseInt(process.env.FEED_REFRESH_INTERVAL_MINUTES || '60', 10),
  feedRefreshBatchSize: parseInt(process.env.FEED_REFRESH_BATCH_SIZE || '10', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Paths
  dataDir: path.dirname(process.env.DATABASE_PATH || './data/macrofeed.db'),
} as const;

export type Config = typeof config;

