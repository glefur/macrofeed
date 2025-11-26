import { getDatabase, closeDatabase } from './index.js';
import logger from '../utils/logger.js';

const migrations = [
  // Migration 1: Initial schema
  {
    version: 1,
    name: 'initial_schema',
    up: `
      -- Schema version table
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login_at TEXT
      );

      -- User sessions table
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        user_agent TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

      -- Categories table
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, title)
      );

      CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);

      -- Feeds table
      CREATE TABLE IF NOT EXISTS feeds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        feed_url TEXT NOT NULL,
        site_url TEXT NOT NULL DEFAULT '',
        description TEXT,
        favicon_url TEXT,
        etag_header TEXT,
        last_modified_header TEXT,
        last_fetched_at TEXT,
        next_fetch_at TEXT,
        error_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
        UNIQUE(user_id, feed_url)
      );

      CREATE INDEX IF NOT EXISTS idx_feeds_user_id ON feeds(user_id);
      CREATE INDEX IF NOT EXISTS idx_feeds_category_id ON feeds(category_id);
      CREATE INDEX IF NOT EXISTS idx_feeds_next_fetch_at ON feeds(next_fetch_at);
      CREATE INDEX IF NOT EXISTS idx_feeds_disabled ON feeds(disabled);

      -- Entries table
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        feed_id INTEGER NOT NULL,
        hash TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        author TEXT,
        content TEXT,
        summary TEXT,
        published_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'read', 'removed')),
        starred INTEGER NOT NULL DEFAULT 0,
        reading_time INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
        UNIQUE(feed_id, hash)
      );

      CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries(user_id);
      CREATE INDEX IF NOT EXISTS idx_entries_feed_id ON entries(feed_id);
      CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
      CREATE INDEX IF NOT EXISTS idx_entries_starred ON entries(starred);
      CREATE INDEX IF NOT EXISTS idx_entries_published_at ON entries(published_at);
      CREATE INDEX IF NOT EXISTS idx_entries_user_status ON entries(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_entries_feed_hash ON entries(feed_id, hash);

      -- Enclosures table (for podcasts, videos, etc.)
      CREATE TABLE IF NOT EXISTS enclosures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL,
        url TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER,
        FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_enclosures_entry_id ON enclosures(entry_id);
    `,
  },
];

export async function migrate(): Promise<void> {
  const db = getDatabase();

  // Create schema_version table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Get current version
  const currentVersion = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null };
  const currentVersionNumber = currentVersion?.version || 0;

  logger.info(`Current database version: ${currentVersionNumber}`);

  // Apply pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersionNumber) {
      logger.info(`Applying migration ${migration.version}: ${migration.name}`);
      
      const transaction = db.transaction(() => {
        db.exec(migration.up);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version);
      });

      try {
        transaction();
        logger.info(`Migration ${migration.version} applied successfully`);
      } catch (error) {
        logger.error(`Failed to apply migration ${migration.version}:`, error);
        throw error;
      }
    }
  }

  logger.info('All migrations applied');
}

// Run migrations if this file is executed directly
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  migrate()
    .then(() => {
      logger.info('Migration completed');
      closeDatabase();
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      closeDatabase();
      process.exit(1);
    });
}

export default migrate;

