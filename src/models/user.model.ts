import bcrypt from 'bcrypt';
import { getDatabase } from '../database/index.js';
import type { User, UserCreateInput, UserPublic } from '../types/index.js';

const SALT_ROUNDS = 12;

export class UserModel {
  static toPublic(user: User): UserPublic {
    return {
      id: user.id,
      username: user.username,
      is_admin: Boolean(user.is_admin),
      created_at: user.created_at,
      last_login_at: user.last_login_at,
    };
  }

  static async create(input: UserCreateInput): Promise<User> {
    const db = getDatabase();
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const isAdmin = input.is_admin ? 1 : 0;

    const stmt = db.prepare(`
      INSERT INTO users (username, password_hash, is_admin)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(input.username.toLowerCase(), passwordHash, isAdmin);
    const user = this.findById(result.lastInsertRowid as number);
    
    if (!user) {
      throw new Error('Failed to create user');
    }

    // Create default category for the user
    db.prepare(`
      INSERT INTO categories (user_id, title)
      VALUES (?, 'Default')
    `).run(user.id);

    return user;
  }

  static findById(id: number): User | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmt.get(id) as User | undefined;
    return user || null;
  }

  static findByUsername(username: string): User | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE');
    const user = stmt.get(username.toLowerCase()) as User | undefined;
    return user || null;
  }

  static findAll(): User[] {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM users ORDER BY username');
    return stmt.all() as User[];
  }

  static async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
  }

  static async updatePassword(userId: number, newPassword: string): Promise<void> {
    const db = getDatabase();
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    
    db.prepare(`
      UPDATE users 
      SET password_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(passwordHash, userId);
  }

  static updateLastLogin(userId: number): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE users 
      SET last_login_at = datetime('now')
      WHERE id = ?
    `).run(userId);
  }

  static update(userId: number, updates: Partial<Pick<User, 'username' | 'is_admin'>>): User | null {
    const db = getDatabase();
    const setClauses: string[] = [];
    const values: (string | number)[] = [];

    if (updates.username !== undefined) {
      setClauses.push('username = ?');
      values.push(updates.username.toLowerCase());
    }
    if (updates.is_admin !== undefined) {
      setClauses.push('is_admin = ?');
      values.push(updates.is_admin ? 1 : 0);
    }

    if (setClauses.length === 0) {
      return this.findById(userId);
    }

    setClauses.push("updated_at = datetime('now')");
    values.push(userId);

    db.prepare(`
      UPDATE users 
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `).run(...values);

    return this.findById(userId);
  }

  static delete(userId: number): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return result.changes > 0;
  }

  static count(): number {
    const db = getDatabase();
    const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return result.count;
  }

  static usernameExists(username: string, excludeUserId?: number): boolean {
    const db = getDatabase();
    if (excludeUserId) {
      const result = db.prepare(
        'SELECT 1 FROM users WHERE username = ? COLLATE NOCASE AND id != ?'
      ).get(username.toLowerCase(), excludeUserId);
      return !!result;
    }
    const result = db.prepare(
      'SELECT 1 FROM users WHERE username = ? COLLATE NOCASE'
    ).get(username.toLowerCase());
    return !!result;
  }
}

export default UserModel;

