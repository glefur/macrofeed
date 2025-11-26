import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/index.js';
import { config } from '../config/index.js';
import type { UserSession } from '../types/index.js';

export class SessionModel {
  static create(
    userId: number,
    userAgent?: string,
    ipAddress?: string
  ): UserSession {
    const db = getDatabase();
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + config.sessionMaxAge).toISOString();

    const stmt = db.prepare(`
      INSERT INTO user_sessions (user_id, token, user_agent, ip_address, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(userId, token, userAgent || null, ipAddress || null, expiresAt);
    
    return this.findById(result.lastInsertRowid as number)!;
  }

  static findById(id: number): UserSession | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM user_sessions WHERE id = ?');
    const session = stmt.get(id) as UserSession | undefined;
    return session || null;
  }

  static findByToken(token: string): UserSession | null {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM user_sessions 
      WHERE token = ? AND expires_at > datetime('now')
    `);
    const session = stmt.get(token) as UserSession | undefined;
    return session || null;
  }

  static findByUserId(userId: number): UserSession[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM user_sessions 
      WHERE user_id = ? AND expires_at > datetime('now')
      ORDER BY created_at DESC
    `);
    return stmt.all(userId) as UserSession[];
  }

  static delete(sessionId: number): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM user_sessions WHERE id = ?').run(sessionId);
    return result.changes > 0;
  }

  static deleteByToken(token: string): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token);
    return result.changes > 0;
  }

  static deleteByUserId(userId: number): number {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(userId);
    return result.changes;
  }

  static deleteExpired(): number {
    const db = getDatabase();
    const result = db.prepare(`
      DELETE FROM user_sessions WHERE expires_at <= datetime('now')
    `).run();
    return result.changes;
  }

  static extend(sessionId: number): UserSession | null {
    const db = getDatabase();
    const newExpiresAt = new Date(Date.now() + config.sessionMaxAge).toISOString();
    
    db.prepare(`
      UPDATE user_sessions 
      SET expires_at = ?
      WHERE id = ?
    `).run(newExpiresAt, sessionId);

    return this.findById(sessionId);
  }
}

export default SessionModel;

