import Parser from 'rss-parser';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { FeedModel } from '../models/feed.model.js';
import { EntryModel } from '../models/entry.model.js';
import { CategoryModel } from '../models/category.model.js';
import type { Feed, FeedCreateInput, FeedWithCounts, Entry, ParsedFeed, ParsedFeedItem } from '../types/index.js';
import { ValidationError, NotFoundError, ConflictError } from '../middlewares/error.middleware.js';
import logger from '../utils/logger.js';
import { config } from '../config/index.js';

const parser = new Parser({
  timeout: 30000,
  headers: {
    'User-Agent': 'Macrofeed/1.0 (RSS Aggregator)',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json',
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['enclosure', 'enclosure'],
    ],
  },
});

export interface FeedSubscribeResult {
  feed: Feed;
  entriesCreated: number;
}

export interface FeedRefreshResult {
  feed: Feed;
  newEntries: number;
  success: boolean;
  error?: string;
}

export class FeedService {
  /**
   * Subscribe to a new feed
   */
  static async subscribe(
    userId: number,
    input: FeedCreateInput
  ): Promise<FeedSubscribeResult> {
    // Validate URL
    if (!input.feed_url || !this.isValidUrl(input.feed_url)) {
      throw new ValidationError('Invalid feed URL');
    }

    // Check if already subscribed
    if (FeedModel.feedUrlExists(userId, input.feed_url)) {
      throw new ConflictError('Already subscribed to this feed');
    }

    // Get or create category
    let categoryId = input.category_id;
    if (!categoryId) {
      const defaultCategory = CategoryModel.getDefaultCategory(userId);
      if (!defaultCategory) {
        throw new ValidationError('No category available');
      }
      categoryId = defaultCategory.id;
    } else {
      // Verify category exists and belongs to user
      const category = CategoryModel.findById(categoryId);
      if (!category || category.user_id !== userId) {
        throw new NotFoundError('Category');
      }
    }

    // Fetch and parse the feed
    let parsedFeed: ParsedFeed;
    try {
      parsedFeed = await this.fetchFeed(input.feed_url);
    } catch (error) {
      logger.error(`Failed to fetch feed: ${input.feed_url}`, error);
      throw new ValidationError(`Failed to fetch feed: ${(error as Error).message}`);
    }

    // Try to get favicon
    const faviconUrl = await this.fetchFavicon(parsedFeed.link || input.feed_url);

    // Create the feed
    const feed = FeedModel.create(userId, {
      feed_url: input.feed_url,
      category_id: categoryId,
      title: input.title || parsedFeed.title || 'Untitled Feed',
      site_url: parsedFeed.link,
      description: parsedFeed.description,
      favicon_url: faviconUrl || undefined,
    });

    // Create initial entries
    let entriesCreated = 0;
    for (const item of parsedFeed.items.slice(0, 50)) { // Limit initial fetch
      try {
        const entry = await this.createEntryFromItem(feed, item);
        if (entry) entriesCreated++;
      } catch (error) {
        logger.warn(`Failed to create entry: ${item.link}`, error);
      }
    }

    // Update feed fetch result
    FeedModel.updateFetchResult(feed.id, true, {
      nextFetchMinutes: config.feedRefreshIntervalMinutes,
    });

    return { feed: FeedModel.findById(feed.id)!, entriesCreated };
  }

  /**
   * Refresh a single feed
   */
  static async refreshFeed(feedId: number): Promise<FeedRefreshResult> {
    const feed = FeedModel.findById(feedId);
    if (!feed) {
      throw new NotFoundError('Feed');
    }

    try {
      // Fetch with conditional headers
      const parsedFeed = await this.fetchFeed(feed.feed_url, {
        etag: feed.etag_header,
        lastModified: feed.last_modified_header,
      });

      // Create new entries
      let newEntries = 0;
      for (const item of parsedFeed.items) {
        try {
          const entry = await this.createEntryFromItem(feed, item);
          if (entry) newEntries++;
        } catch (error) {
          logger.warn(`Failed to create entry: ${item.link}`, error);
        }
      }

      // Update feed
      FeedModel.updateFetchResult(feed.id, true, {
        nextFetchMinutes: config.feedRefreshIntervalMinutes,
      });

      // Update favicon if missing
      if (!feed.favicon_url && parsedFeed.link) {
        const faviconUrl = await this.fetchFavicon(parsedFeed.link);
        if (faviconUrl) {
          FeedModel.update(feed.id, feed.user_id, { favicon_url: faviconUrl });
        }
      }

      return {
        feed: FeedModel.findById(feed.id)!,
        newEntries,
        success: true,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error(`Failed to refresh feed ${feed.id}: ${errorMessage}`);

      FeedModel.updateFetchResult(feed.id, false, {
        errorMessage,
        nextFetchMinutes: config.feedRefreshIntervalMinutes,
      });

      return {
        feed: FeedModel.findById(feed.id)!,
        newEntries: 0,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Refresh all feeds due for refresh
   */
  static async refreshDueFeeds(): Promise<{ refreshed: number; errors: number }> {
    const feeds = FeedModel.findFeedsToRefresh(config.feedRefreshBatchSize);
    let refreshed = 0;
    let errors = 0;

    for (const feed of feeds) {
      try {
        const result = await this.refreshFeed(feed.id);
        if (result.success) {
          refreshed++;
          if (result.newEntries > 0) {
            logger.info(`Feed ${feed.id} (${feed.title}): ${result.newEntries} new entries`);
          }
        } else {
          errors++;
        }
      } catch (error) {
        errors++;
        logger.error(`Error refreshing feed ${feed.id}:`, error);
      }
    }

    return { refreshed, errors };
  }

  /**
   * Get all feeds for a user with counts
   */
  static getFeeds(userId: number): FeedWithCounts[] {
    return FeedModel.findByUserIdWithCounts(userId);
  }

  /**
   * Get a specific feed
   */
  static getFeed(feedId: number, userId: number): FeedWithCounts | null {
    const feeds = FeedModel.findByUserIdWithCounts(userId);
    return feeds.find(f => f.id === feedId) || null;
  }

  /**
   * Update a feed
   */
  static updateFeed(
    feedId: number,
    userId: number,
    updates: Partial<Pick<Feed, 'title' | 'category_id' | 'disabled'>>
  ): Feed | null {
    const feed = FeedModel.findByIdAndUserId(feedId, userId);
    if (!feed) {
      throw new NotFoundError('Feed');
    }

    // Validate category if provided
    if (updates.category_id) {
      const category = CategoryModel.findById(updates.category_id);
      if (!category || category.user_id !== userId) {
        throw new NotFoundError('Category');
      }
    }

    return FeedModel.update(feedId, userId, updates);
  }

  /**
   * Delete a feed
   */
  static deleteFeed(feedId: number, userId: number): boolean {
    const feed = FeedModel.findByIdAndUserId(feedId, userId);
    if (!feed) {
      throw new NotFoundError('Feed');
    }

    return FeedModel.delete(feedId, userId);
  }

  /**
   * Fetch and parse a feed URL
   */
  private static async fetchFeed(
    url: string,
    options: { etag?: string | null; lastModified?: string | null } = {}
  ): Promise<ParsedFeed> {
    const headers: Record<string, string> = {};
    
    if (options.etag) {
      headers['If-None-Match'] = options.etag;
    }
    if (options.lastModified) {
      headers['If-Modified-Since'] = options.lastModified;
    }

    const feed = await parser.parseURL(url);

    return {
      title: feed.title || 'Untitled',
      description: feed.description,
      link: feed.link,
      feedUrl: feed.feedUrl,
      items: feed.items as ParsedFeedItem[],
    };
  }

  /**
   * Create an entry from a parsed feed item
   */
  private static async createEntryFromItem(
    feed: Feed,
    item: ParsedFeedItem
  ): Promise<Entry | null> {
    if (!item.link) return null;

    const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();
    const content = item.content || item.summary || item.contentSnippet || '';
    const readingTime = this.estimateReadingTime(content);

    const entry = EntryModel.createIfNotExists({
      feed_id: feed.id,
      user_id: feed.user_id,
      title: item.title || 'Untitled',
      url: item.link,
      author: item.creator || item.author,
      content,
      summary: item.contentSnippet || item.summary,
      published_at: publishedAt,
      reading_time: readingTime,
    });

    // Add enclosure if present
    if (entry && item.enclosure?.url) {
      EntryModel.addEnclosure(entry.id, {
        url: item.enclosure.url,
        mime_type: item.enclosure.type || null,
        size: item.enclosure.length ? parseInt(item.enclosure.length, 10) : null,
      });
    }

    return entry;
  }

  /**
   * Fetch full article content using Readability
   */
  static async fetchFullContent(url: string): Promise<{ title: string; content: string; excerpt?: string } | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Macrofeed/1.0 (RSS Aggregator)',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article) {
        return null;
      }

      return {
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
      };
    } catch (error) {
      logger.warn(`Failed to fetch full content: ${url}`, error);
      return null;
    }
  }

  /**
   * Fetch favicon for a site
   */
  private static async fetchFavicon(siteUrl: string): Promise<string | null> {
    try {
      const url = new URL(siteUrl);
      const faviconUrls = [
        `${url.origin}/favicon.ico`,
        `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`,
      ];

      for (const faviconUrl of faviconUrls) {
        try {
          const response = await fetch(faviconUrl, { method: 'HEAD' });
          if (response.ok) {
            return faviconUrl;
          }
        } catch {
          continue;
        }
      }

      // Fallback to Google's favicon service
      return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
    } catch {
      return null;
    }
  }

  /**
   * Estimate reading time in minutes
   */
  private static estimateReadingTime(content: string): number {
    // Strip HTML tags
    const text = content.replace(/<[^>]*>/g, '');
    // Count words (rough estimate)
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    // Average reading speed: 200-250 words per minute
    return Math.max(1, Math.ceil(wordCount / 200));
  }

  /**
   * Validate URL format
   */
  private static isValidUrl(urlString: string): boolean {
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

export default FeedService;

