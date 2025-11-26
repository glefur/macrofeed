// User types
export interface User {
  id: number;
  username: string;
  password_hash: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface UserCreateInput {
  username: string;
  password: string;
  is_admin?: boolean;
}

export interface UserPublic {
  id: number;
  username: string;
  is_admin: boolean;
  created_at: string;
  last_login_at: string | null;
}

// Category types
export interface Category {
  id: number;
  user_id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryCreateInput {
  title: string;
}

export interface CategoryWithFeedCount extends Category {
  feed_count: number;
  unread_count: number;
}

// Feed types
export interface Feed {
  id: number;
  user_id: number;
  category_id: number;
  title: string;
  feed_url: string;
  site_url: string;
  description: string | null;
  favicon_url: string | null;
  etag_header: string | null;
  last_modified_header: string | null;
  last_fetched_at: string | null;
  next_fetch_at: string | null;
  error_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedCreateInput {
  feed_url: string;
  category_id?: number;
  title?: string;
}

export interface FeedWithCounts extends Feed {
  total_count: number;
  category_title: string;
}

// Entry types
export interface Entry {
  id: number;
  user_id: number;
  feed_id: number;
  hash: string;
  title: string;
  url: string;
  author: string | null;
  content: string | null; // Always null - content is fetched on-demand, not stored
  summary: string | null;
  published_at: string;
  starred: boolean;
  created_at: string;
  updated_at: string;
}

export interface EntryWithFeed extends Entry {
  feed_title: string;
  feed_favicon_url: string | null;
  category_id: number;
  category_title: string;
}

// Enclosure types
export interface Enclosure {
  id: number;
  entry_id: number;
  url: string;
  mime_type: string | null;
  size: number | null;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Feed parsing types
export interface ParsedFeed {
  title: string;
  description?: string;
  link?: string;
  feedUrl?: string;
  items: ParsedFeedItem[];
}

export interface ParsedFeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  creator?: string;
  author?: string;
  content?: string;
  contentSnippet?: string;
  summary?: string;
  enclosure?: {
    url?: string;
    type?: string;
    length?: string;
  };
}

// Express session augmentation
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    username?: string;
    isAdmin?: boolean;
  }
}

