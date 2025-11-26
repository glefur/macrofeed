import cron from 'node-cron';
import { FeedService } from '../services/feed.service.js';
import { AuthService } from '../services/auth.service.js';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

let feedRefreshTask: cron.ScheduledTask | null = null;
let sessionCleanupTask: cron.ScheduledTask | null = null;

/**
 * Start the feed refresh scheduler
 */
export function startScheduler(): void {
  const intervalMinutes = config.feedRefreshIntervalMinutes;

  // Feed refresh task - runs every X minutes
  // Using cron expression: "*/X * * * *" means every X minutes
  const cronExpression = `*/${Math.max(1, Math.min(intervalMinutes, 59))} * * * *`;

  feedRefreshTask = cron.schedule(cronExpression, async () => {
    logger.debug('Starting scheduled feed refresh...');
    
    try {
      const result = await FeedService.refreshDueFeeds();
      
      if (result.refreshed > 0 || result.errors > 0) {
        logger.info(
          `Feed refresh completed: ${result.refreshed} refreshed, ${result.errors} errors`
        );
      }
    } catch (error) {
      logger.error('Error during scheduled feed refresh:', error);
    }
  });

  // Session cleanup task - runs every hour
  sessionCleanupTask = cron.schedule('0 * * * *', () => {
    logger.debug('Starting session cleanup...');
    
    try {
      const deleted = AuthService.cleanupExpiredSessions();
      if (deleted > 0) {
        logger.info(`Cleaned up ${deleted} expired sessions`);
      }
    } catch (error) {
      logger.error('Error during session cleanup:', error);
    }
  });

  logger.info(`Scheduler started:`);
  logger.info(`  - Feed refresh: every ${intervalMinutes} minutes`);
  logger.info(`  - Session cleanup: every hour`);
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (feedRefreshTask) {
    feedRefreshTask.stop();
    feedRefreshTask = null;
  }

  if (sessionCleanupTask) {
    sessionCleanupTask.stop();
    sessionCleanupTask = null;
  }

  logger.info('Scheduler stopped');
}

/**
 * Trigger immediate feed refresh (for testing or manual trigger)
 */
export async function triggerFeedRefresh(): Promise<{ refreshed: number; errors: number }> {
  logger.info('Triggering immediate feed refresh...');
  return FeedService.refreshDueFeeds();
}

export default { startScheduler, stopScheduler, triggerFeedRefresh };

