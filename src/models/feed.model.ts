import { getDatabase } from '../database/index.js';
import type { Feed, FeedCreateInput, FeedWithCounts } from '../types/index.js';

export class FeedModel {
  static create(userId: number, input: FeedCreateInput & { 
    title: string; 
    site_url?: string; 
    description?: string;
    favicon_url?: string;
  }): Feed {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO feeds (user_id, category_id, title, feed_url, site_url, description, favicon_url, next_fetch_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const result = stmt.run(
      userId,
      input.category_id,
      input.title,
      input.feed_url,
      input.site_url || '',
      input.description || null,
      input.favicon_url || null
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  static findById(id: number): Feed | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM feeds WHERE id = ?');
    const feed = stmt.get(id) as Feed | undefined;
    return feed || null;
  }

  static findByIdAndUserId(id: number, userId: number): Feed | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM feeds WHERE id = ? AND user_id = ?');
    const feed = stmt.get(id, userId) as Feed | undefined;
    return feed || null;
  }

  static findByUserId(userId: number): Feed[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM feeds 
      WHERE user_id = ?
      ORDER BY title
    `);
    return stmt.all(userId) as Feed[];
  }

  static findByUserIdWithCounts(userId: number): FeedWithCounts[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT 
        f.*,
        c.title as category_title,
        COUNT(DISTINCT e.id) as total_count
      FROM feeds f
      JOIN categories c ON c.id = f.category_id
      LEFT JOIN entries e ON e.feed_id = f.id
      WHERE f.user_id = ?
      GROUP BY f.id
      ORDER BY f.title
    `);
    return stmt.all(userId) as FeedWithCounts[];
  }

  static findByCategoryId(categoryId: number, userId: number): Feed[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM feeds 
      WHERE category_id = ? AND user_id = ?
      ORDER BY title
    `);
    return stmt.all(categoryId, userId) as Feed[];
  }

  static findFeedsToRefresh(batchSize: number): Feed[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM feeds 
      WHERE (next_fetch_at IS NULL OR next_fetch_at <= datetime('now'))
      ORDER BY next_fetch_at ASC
      LIMIT ?
    `);
    return stmt.all(batchSize) as Feed[];
  }

  static feedUrlExists(userId: number, feedUrl: string, excludeFeedId?: number): boolean {
    const db = getDatabase();
    if (excludeFeedId) {
      const result = db.prepare(`
        SELECT 1 FROM feeds 
        WHERE user_id = ? AND feed_url = ? AND id != ?
      `).get(userId, feedUrl, excludeFeedId);
      return !!result;
    }
    const result = db.prepare(`
      SELECT 1 FROM feeds 
      WHERE user_id = ? AND feed_url = ?
    `).get(userId, feedUrl);
    return !!result;
  }

  static update(feedId: number, userId: number, updates: Partial<Omit<Feed, 'id' | 'user_id' | 'created_at'>>): Feed | null {
    const db = getDatabase();
    const allowedFields = [
      'category_id', 'title', 'feed_url', 'site_url', 'description', 
      'favicon_url', 'etag_header', 'last_modified_header', 'last_fetched_at',
      'next_fetch_at', 'error_count', 'error_message'
    ];

    const setClauses: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = ?`);
        values.push(value as string | number | null);
      }
    }

    if (setClauses.length === 0) {
      return this.findById(feedId);
    }

    setClauses.push("updated_at = datetime('now')");
    values.push(feedId, userId);

    db.prepare(`
      UPDATE feeds 
      SET ${setClauses.join(', ')}
      WHERE id = ? AND user_id = ?
    `).run(...values);

    return this.findById(feedId);
  }

  static updateFetchResult(
    feedId: number, 
    success: boolean, 
    options: {
      etag?: string | null;
      lastModified?: string | null;
      errorMessage?: string | null;
      nextFetchMinutes?: number;
    } = {}
  ): void {
    const db = getDatabase();
    const nextFetchMinutes = options.nextFetchMinutes || 60;

    if (success) {
      db.prepare(`
        UPDATE feeds 
        SET 
          last_fetched_at = datetime('now'),
          next_fetch_at = datetime('now', '+${nextFetchMinutes} minutes'),
          etag_header = ?,
          last_modified_header = ?,
          error_count = 0,
          error_message = NULL,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(options.etag || null, options.lastModified || null, feedId);
    } else {
      // Exponential backoff: double the wait time with each error, max 24 hours
      const errorCountResult = db.prepare('SELECT error_count FROM feeds WHERE id = ?').get(feedId) as { error_count: number } | undefined;
      const errorCount = (errorCountResult?.error_count || 0) + 1;
      const backoffMinutes = Math.min(nextFetchMinutes * Math.pow(2, errorCount - 1), 1440);

      db.prepare(`
        UPDATE feeds 
        SET 
          last_fetched_at = datetime('now'),
          next_fetch_at = datetime('now', '+${backoffMinutes} minutes'),
          error_count = ?,
          error_message = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(errorCount, options.errorMessage || null, feedId);
    }
  }

  static delete(feedId: number, userId: number): boolean {
    const db = getDatabase();
    const result = db.prepare(
      'DELETE FROM feeds WHERE id = ? AND user_id = ?'
    ).run(feedId, userId);
    return result.changes > 0;
  }

  static countByUserId(userId: number): number {
    const db = getDatabase();
    const result = db.prepare(
      'SELECT COUNT(*) as count FROM feeds WHERE user_id = ?'
    ).get(userId) as { count: number };
    return result.count;
  }

  static countWithErrors(userId: number): number {
    const db = getDatabase();
    const result = db.prepare(
      'SELECT COUNT(*) as count FROM feeds WHERE user_id = ? AND error_count > 0'
    ).get(userId) as { count: number };
    return result.count;
  }
}

export default FeedModel;

