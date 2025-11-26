import { getDatabase } from '../database/index.js';
import type { Category, CategoryCreateInput, CategoryWithFeedCount } from '../types/index.js';

export class CategoryModel {
  static create(userId: number, input: CategoryCreateInput): Category {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO categories (user_id, title)
      VALUES (?, ?)
    `);

    const result = stmt.run(userId, input.title.trim());
    return this.findById(result.lastInsertRowid as number)!;
  }

  static findById(id: number): Category | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM categories WHERE id = ?');
    const category = stmt.get(id) as Category | undefined;
    return category || null;
  }

  static findByUserIdAndTitle(userId: number, title: string): Category | null {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM categories 
      WHERE user_id = ? AND title = ? COLLATE NOCASE
    `);
    const category = stmt.get(userId, title) as Category | undefined;
    return category || null;
  }

  static findByUserId(userId: number): Category[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM categories 
      WHERE user_id = ?
      ORDER BY title
    `);
    return stmt.all(userId) as Category[];
  }

  static findByUserIdWithCounts(userId: number): CategoryWithFeedCount[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT 
        c.*,
        COUNT(DISTINCT f.id) as feed_count,
        0 as unread_count
      FROM categories c
      LEFT JOIN feeds f ON f.category_id = c.id
      WHERE c.user_id = ?
      GROUP BY c.id
      ORDER BY c.title
    `);
    return stmt.all(userId) as CategoryWithFeedCount[];
  }

  static update(categoryId: number, userId: number, updates: Partial<CategoryCreateInput>): Category | null {
    const db = getDatabase();
    const setClauses: string[] = [];
    const values: (string | number)[] = [];

    if (updates.title !== undefined) {
      setClauses.push('title = ?');
      values.push(updates.title.trim());
    }

    if (setClauses.length === 0) {
      return this.findById(categoryId);
    }

    setClauses.push("updated_at = datetime('now')");
    values.push(categoryId, userId);

    db.prepare(`
      UPDATE categories 
      SET ${setClauses.join(', ')}
      WHERE id = ? AND user_id = ?
    `).run(...values);

    return this.findById(categoryId);
  }

  static delete(categoryId: number, userId: number): boolean {
    const db = getDatabase();
    
    // Check if this is the last category for the user
    const categoryCount = db.prepare(
      'SELECT COUNT(*) as count FROM categories WHERE user_id = ?'
    ).get(userId) as { count: number };
    
    if (categoryCount.count <= 1) {
      throw new Error('Cannot delete the last category');
    }

    // Get the first remaining category to reassign feeds
    const firstCategory = db.prepare(`
      SELECT id FROM categories 
      WHERE user_id = ? AND id != ?
      ORDER BY title LIMIT 1
    `).get(userId, categoryId) as { id: number } | undefined;

    if (!firstCategory) {
      throw new Error('No category available to reassign feeds');
    }

    // Reassign feeds to the first category
    db.prepare(`
      UPDATE feeds 
      SET category_id = ?, updated_at = datetime('now')
      WHERE category_id = ? AND user_id = ?
    `).run(firstCategory.id, categoryId, userId);

    // Delete the category
    const result = db.prepare(
      'DELETE FROM categories WHERE id = ? AND user_id = ?'
    ).run(categoryId, userId);

    return result.changes > 0;
  }

  static titleExists(userId: number, title: string, excludeCategoryId?: number): boolean {
    const db = getDatabase();
    if (excludeCategoryId) {
      const result = db.prepare(`
        SELECT 1 FROM categories 
        WHERE user_id = ? AND title = ? COLLATE NOCASE AND id != ?
      `).get(userId, title, excludeCategoryId);
      return !!result;
    }
    const result = db.prepare(`
      SELECT 1 FROM categories 
      WHERE user_id = ? AND title = ? COLLATE NOCASE
    `).get(userId, title);
    return !!result;
  }

  static getDefaultCategory(userId: number): Category | null {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM categories 
      WHERE user_id = ?
      ORDER BY id LIMIT 1
    `);
    const category = stmt.get(userId) as Category | undefined;
    return category || null;
  }
}

export default CategoryModel;

