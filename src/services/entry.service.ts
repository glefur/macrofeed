import { EntryModel, EntryQueryOptions } from '../models/entry.model.js';
import { FeedModel } from '../models/feed.model.js';
import { CategoryModel } from '../models/category.model.js';
import { FeedService } from './feed.service.js';
import type { EntryWithFeed, PaginatedResponse, Enclosure } from '../types/index.js';
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
   * Fetch full content for an entry using Readability
   * Content is fetched on-demand and not stored in database
   */
  static async fetchFullContent(entryId: number, userId: number): Promise<{
    entry: EntryWithFeed;
    content: string;
    title: string;
    excerpt?: string;
  }> {
    const entry = EntryModel.findByIdAndUserId(entryId, userId);
    if (!entry) {
      throw new NotFoundError('Entry');
    }

    const article = await FeedService.fetchFullContent(entry.url);
    if (!article) {
      throw new ValidationError('Could not extract article content');
    }

    // Return entry with fetched content (not stored)
    const updatedEntry = EntryModel.findByIdAndUserId(entryId, userId)!;
    
    return {
      entry: updatedEntry,
      content: article.content,
      title: article.title,
      excerpt: article.excerpt,
    };
  }

  /**
   * Get counts for dashboard
   */
  static getCounts(userId: number): {
    starred: number;
    total: number;
  } {
    return {
      starred: EntryModel.countStarred(userId),
      total: 0, // Could add total count if needed
    };
  }
}

export default EntryService;

