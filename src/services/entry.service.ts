import { EntryModel, EntryQueryOptions } from '../models/entry.model.js';
import { FeedModel } from '../models/feed.model.js';
import { CategoryModel } from '../models/category.model.js';
import { FeedService } from './feed.service.js';
import type { EntryWithFeed, EntryStatus, PaginatedResponse, Enclosure } from '../types/index.js';
import { NotFoundError, ValidationError } from '../middlewares/error.middleware.js';

export class EntryService {
  /**
   * Get entries with filters and pagination
   */
  static getEntries(
    userId: number,
    options: EntryQueryOptions = {}
  ): PaginatedResponse<EntryWithFeed> {
    // Validate feed_id if provided
    if (options.feed_id) {
      const feed = FeedModel.findByIdAndUserId(options.feed_id, userId);
      if (!feed) {
        throw new NotFoundError('Feed');
      }
    }

    // Validate category_id if provided
    if (options.category_id) {
      const category = CategoryModel.findById(options.category_id);
      if (!category || category.user_id !== userId) {
        throw new NotFoundError('Category');
      }
    }

    return EntryModel.findByUserId(userId, options);
  }

  /**
   * Get unread entries
   */
  static getUnreadEntries(
    userId: number,
    options: Omit<EntryQueryOptions, 'status'> = {}
  ): PaginatedResponse<EntryWithFeed> {
    return this.getEntries(userId, { ...options, status: 'unread' });
  }

  /**
   * Get starred entries
   */
  static getStarredEntries(
    userId: number,
    options: Omit<EntryQueryOptions, 'starred'> = {}
  ): PaginatedResponse<EntryWithFeed> {
    return this.getEntries(userId, { ...options, starred: true });
  }

  /**
   * Get a single entry by ID
   */
  static getEntry(entryId: number, userId: number): EntryWithFeed {
    const entry = EntryModel.findByIdAndUserId(entryId, userId);
    if (!entry) {
      throw new NotFoundError('Entry');
    }
    return entry;
  }

  /**
   * Get entry with enclosures
   */
  static getEntryWithEnclosures(
    entryId: number,
    userId: number
  ): { entry: EntryWithFeed; enclosures: Enclosure[] } {
    const entry = this.getEntry(entryId, userId);
    const enclosures = EntryModel.getEnclosures(entryId);
    return { entry, enclosures };
  }

  /**
   * Update entry status
   */
  static updateStatus(
    entryId: number,
    userId: number,
    status: EntryStatus
  ): EntryWithFeed {
    if (!['unread', 'read', 'removed'].includes(status)) {
      throw new ValidationError('Invalid status');
    }

    const entry = EntryModel.findByIdAndUserId(entryId, userId);
    if (!entry) {
      throw new NotFoundError('Entry');
    }

    EntryModel.updateStatus(entryId, userId, status);
    return EntryModel.findByIdAndUserId(entryId, userId)!;
  }

  /**
   * Update status for multiple entries
   */
  static updateStatusBatch(
    entryIds: number[],
    userId: number,
    status: EntryStatus
  ): number {
    if (!['unread', 'read', 'removed'].includes(status)) {
      throw new ValidationError('Invalid status');
    }

    if (!entryIds.length) {
      return 0;
    }

    return EntryModel.updateStatusBatch(entryIds, userId, status);
  }

  /**
   * Toggle starred status
   */
  static toggleStarred(entryId: number, userId: number): EntryWithFeed {
    const entry = EntryModel.findByIdAndUserId(entryId, userId);
    if (!entry) {
      throw new NotFoundError('Entry');
    }

    EntryModel.toggleStarred(entryId, userId);
    return EntryModel.findByIdAndUserId(entryId, userId)!;
  }

  /**
   * Set starred status
   */
  static setStarred(entryId: number, userId: number, starred: boolean): EntryWithFeed {
    const entry = EntryModel.findByIdAndUserId(entryId, userId);
    if (!entry) {
      throw new NotFoundError('Entry');
    }

    EntryModel.setStarred(entryId, userId, starred);
    return EntryModel.findByIdAndUserId(entryId, userId)!;
  }

  /**
   * Mark all entries as read
   */
  static markAllAsRead(
    userId: number,
    options: { feed_id?: number; category_id?: number } = {}
  ): number {
    // Validate feed_id if provided
    if (options.feed_id) {
      const feed = FeedModel.findByIdAndUserId(options.feed_id, userId);
      if (!feed) {
        throw new NotFoundError('Feed');
      }
    }

    // Validate category_id if provided
    if (options.category_id) {
      const category = CategoryModel.findById(options.category_id);
      if (!category || category.user_id !== userId) {
        throw new NotFoundError('Category');
      }
    }

    return EntryModel.markAllAsRead(userId, options);
  }

  /**
   * Fetch full content for an entry using Readability
   */
  static async fetchFullContent(entryId: number, userId: number): Promise<EntryWithFeed> {
    const entry = EntryModel.findByIdAndUserId(entryId, userId);
    if (!entry) {
      throw new NotFoundError('Entry');
    }

    const article = await FeedService.fetchFullContent(entry.url);
    if (!article) {
      throw new ValidationError('Could not extract article content');
    }

    // Update entry with full content
    const rawEntry = EntryModel.findById(entryId);
    if (rawEntry) {
      const readingTime = Math.max(1, Math.ceil(
        article.content.replace(/<[^>]*>/g, '').split(/\s+/).length / 200
      ));
      
      // We need to update the entry directly in the database
      const db = (await import('../database/index.js')).getDatabase();
      db.prepare(`
        UPDATE entries 
        SET content = ?, reading_time = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(article.content, readingTime, entryId);
    }

    return EntryModel.findByIdAndUserId(entryId, userId)!;
  }

  /**
   * Get counts for dashboard
   */
  static getCounts(userId: number): {
    unread: number;
    starred: number;
    total: number;
  } {
    return {
      unread: EntryModel.countUnread(userId),
      starred: EntryModel.countStarred(userId),
      total: 0, // Could add total count if needed
    };
  }
}

export default EntryService;

