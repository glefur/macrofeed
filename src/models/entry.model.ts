import crypto from 'crypto';
import { getDatabase } from '../database/index.js';
import type { Entry, EntryStatus, EntryWithFeed, PaginatedResponse, Enclosure } from '../types/index.js';

export interface EntryCreateInput {
  feed_id: number;
  user_id: number;
  title: string;
  url: string;
  author?: string;
  content?: string;
  summary?: string;
  published_at: string;
  reading_time?: number;
}

export interface EntryQueryOptions {
  status?: EntryStatus | EntryStatus[];
  starred?: boolean;
  feed_id?: number;
  category_id?: number;
  search?: string;
  page?: number;
  limit?: number;
  order_by?: 'published_at' | 'created_at';
  order_dir?: 'asc' | 'desc';
}

export class EntryModel {
  static generateHash(feedId: number, url: string, title: string): string {
    const data = `${feedId}:${url}:${title}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  static create(input: EntryCreateInput): Entry {
    const db = getDatabase();
    const hash = this.generateHash(input.feed_id, input.url, input.title);

    const stmt = db.prepare(`
      INSERT INTO entries (
        user_id, feed_id, hash, title, url, author, content, summary, 
        published_at, reading_time
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.user_id,
      input.feed_id,
      hash,
      input.title,
      input.url,
      input.author || null,
      input.content || null,
      input.summary || null,
      input.published_at,
      input.reading_time || 0
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  static createIfNotExists(input: EntryCreateInput): Entry | null {
    const db = getDatabase();
    const hash = this.generateHash(input.feed_id, input.url, input.title);

    // Check if entry already exists
    const existing = db.prepare(
      'SELECT id FROM entries WHERE feed_id = ? AND hash = ?'
    ).get(input.feed_id, hash) as { id: number } | undefined;

    if (existing) {
      return null; // Entry already exists
    }

    return this.create(input);
  }

  static findById(id: number): Entry | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM entries WHERE id = ?');
    const entry = stmt.get(id) as Entry | undefined;
    return entry || null;
  }

  static findByIdAndUserId(id: number, userId: number): EntryWithFeed | null {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT 
        e.*,
        f.title as feed_title,
        f.favicon_url as feed_favicon_url,
        c.id as category_id,
        c.title as category_title
      FROM entries e
      JOIN feeds f ON f.id = e.feed_id
      JOIN categories c ON c.id = f.category_id
      WHERE e.id = ? AND e.user_id = ?
    `);
    const entry = stmt.get(id, userId) as EntryWithFeed | undefined;
    return entry || null;
  }

  static findByUserId(userId: number, options: EntryQueryOptions = {}): PaginatedResponse<EntryWithFeed> {
    const db = getDatabase();
    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 100);
    const offset = (page - 1) * limit;
    const orderBy = options.order_by || 'published_at';
    const orderDir = options.order_dir || 'desc';

    const whereClauses: string[] = ['e.user_id = ?'];
    const params: (string | number)[] = [userId];

    // Status filter
    if (options.status) {
      if (Array.isArray(options.status)) {
        whereClauses.push(`e.status IN (${options.status.map(() => '?').join(', ')})`);
        params.push(...options.status);
      } else {
        whereClauses.push('e.status = ?');
        params.push(options.status);
      }
    }

    // Starred filter
    if (options.starred !== undefined) {
      whereClauses.push('e.starred = ?');
      params.push(options.starred ? 1 : 0);
    }

    // Feed filter
    if (options.feed_id) {
      whereClauses.push('e.feed_id = ?');
      params.push(options.feed_id);
    }

    // Category filter
    if (options.category_id) {
      whereClauses.push('f.category_id = ?');
      params.push(options.category_id);
    }

    // Search filter (simple LIKE search)
    if (options.search) {
      whereClauses.push('(e.title LIKE ? OR e.content LIKE ?)');
      const searchPattern = `%${options.search}%`;
      params.push(searchPattern, searchPattern);
    }

    const whereClause = whereClauses.join(' AND ');

    // Get total count
    const countStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM entries e
      JOIN feeds f ON f.id = e.feed_id
      WHERE ${whereClause}
    `);
    const countResult = countStmt.get(...params) as { count: number };
    const total = countResult.count;

    // Get entries
    const entriesStmt = db.prepare(`
      SELECT 
        e.*,
        f.title as feed_title,
        f.favicon_url as feed_favicon_url,
        c.id as category_id,
        c.title as category_title
      FROM entries e
      JOIN feeds f ON f.id = e.feed_id
      JOIN categories c ON c.id = f.category_id
      WHERE ${whereClause}
      ORDER BY e.${orderBy} ${orderDir}
      LIMIT ? OFFSET ?
    `);

    const items = entriesStmt.all(...params, limit, offset) as EntryWithFeed[];

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static updateStatus(entryId: number, userId: number, status: EntryStatus): Entry | null {
    const db = getDatabase();
    db.prepare(`
      UPDATE entries 
      SET status = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(status, entryId, userId);

    return this.findById(entryId);
  }

  static updateStatusBatch(entryIds: number[], userId: number, status: EntryStatus): number {
    const db = getDatabase();
    const placeholders = entryIds.map(() => '?').join(', ');
    const result = db.prepare(`
      UPDATE entries 
      SET status = ?, updated_at = datetime('now')
      WHERE id IN (${placeholders}) AND user_id = ?
    `).run(status, ...entryIds, userId);

    return result.changes;
  }

  static toggleStarred(entryId: number, userId: number): Entry | null {
    const db = getDatabase();
    db.prepare(`
      UPDATE entries 
      SET starred = NOT starred, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(entryId, userId);

    return this.findById(entryId);
  }

  static setStarred(entryId: number, userId: number, starred: boolean): Entry | null {
    const db = getDatabase();
    db.prepare(`
      UPDATE entries 
      SET starred = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(starred ? 1 : 0, entryId, userId);

    return this.findById(entryId);
  }

  static markAllAsRead(userId: number, options: { feed_id?: number; category_id?: number } = {}): number {
    const db = getDatabase();
    const whereClauses: string[] = ['user_id = ?', "status = 'unread'"];
    const params: (string | number)[] = [userId];

    if (options.feed_id) {
      whereClauses.push('feed_id = ?');
      params.push(options.feed_id);
    }

    if (options.category_id) {
      whereClauses.push('feed_id IN (SELECT id FROM feeds WHERE category_id = ?)');
      params.push(options.category_id);
    }

    const result = db.prepare(`
      UPDATE entries 
      SET status = 'read', updated_at = datetime('now')
      WHERE ${whereClauses.join(' AND ')}
    `).run(...params);

    return result.changes;
  }

  static countUnread(userId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COUNT(*) as count 
      FROM entries 
      WHERE user_id = ? AND status = 'unread'
    `).get(userId) as { count: number };
    return result.count;
  }

  static countStarred(userId: number): number {
    const db = getDatabase();
    const result = db.prepare(`
      SELECT COUNT(*) as count 
      FROM entries 
      WHERE user_id = ? AND starred = 1
    `).get(userId) as { count: number };
    return result.count;
  }

  // Enclosures
  static addEnclosure(entryId: number, enclosure: Omit<Enclosure, 'id' | 'entry_id'>): Enclosure {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO enclosures (entry_id, url, mime_type, size)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(entryId, enclosure.url, enclosure.mime_type, enclosure.size);
    
    return {
      id: result.lastInsertRowid as number,
      entry_id: entryId,
      ...enclosure,
    };
  }

  static getEnclosures(entryId: number): Enclosure[] {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM enclosures WHERE entry_id = ?');
    return stmt.all(entryId) as Enclosure[];
  }
}

export default EntryModel;

