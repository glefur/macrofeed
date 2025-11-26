# Macrofeed

Lightweight RSS Aggregator - A minimalist feed reader API.

Macrofeed is a lightweight, self-hosted RSS/Atom/JSON Feed aggregator designed for simplicity and ease of integration. Perfect for home labs, automation with n8n, and personal use.

## Features

### Feed Management
- **Multi-format support**: RSS 1.0/2.0, Atom 0.3/1.0, JSON Feed 1.0/1.1
- **Subscribe by URL**: Easy feed subscription
- **Favicon fetching**: Automatic site icon retrieval
- **Categories**: Organize feeds into categories
- **Bookmarks**: Star/favorite articles
- **Readability**: Extract full article content using Mozilla's Readability
- **Automatic refresh**: Background feed updates with configurable interval
- **HTTP caching**: Respects ETag, Last-Modified, If-Modified-Since headers

### User Management
- **Local authentication**: Username/password login
- **Multi-user support**: Multiple accounts with separate feeds
- **Role-based access**: Admin and regular user roles
- **Session management**: Secure token-based sessions

### Technical
- **SQLite database**: Lightweight, no external database required
- **REST API**: Full-featured JSON API
- **TypeScript**: Type-safe codebase
- **Docker-ready**: Easy containerization

## Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn

### Installation

```bash
# Clone or navigate to the project
cd macrofeed

# Install dependencies
npm install

# Copy environment file
cp env.example .env

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

### Production

```bash
# Build
npm run build

# Start
npm start
```

## Configuration

Create a `.env` file based on `env.example`:

```env
# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_PATH=./data/macrofeed.db

# Session
SESSION_SECRET=your-super-secret-key-change-me
SESSION_MAX_AGE=86400000

# Feed Refresh
FEED_REFRESH_INTERVAL_MINUTES=60
FEED_REFRESH_BATCH_SIZE=10

# Logging
LOG_LEVEL=info
```

## API Reference

### Authentication

#### Check Registration Availability
```
GET /api/auth/check
```

#### Register (First User Becomes Admin)
```
POST /api/auth/register
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}
```

#### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}
```

#### Get Current User
```
GET /api/auth/me
Authorization: Bearer <token>
```

#### Logout
```
POST /api/auth/logout
Authorization: Bearer <token>
```

### Feeds

#### List Feeds
```
GET /api/feeds
Authorization: Bearer <token>
```

#### Subscribe to Feed
```
POST /api/feeds
Authorization: Bearer <token>
Content-Type: application/json

{
  "feed_url": "https://example.com/feed.xml",
  "category_id": 1,  // optional
  "title": "Custom Title"  // optional
}
```

#### Get Feed
```
GET /api/feeds/:id
Authorization: Bearer <token>
```

#### Update Feed
```
PUT /api/feeds/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "New Title",
  "category_id": 2,
  "disabled": false
}
```

#### Delete Feed
```
DELETE /api/feeds/:id
Authorization: Bearer <token>
```

#### Refresh Feed
```
POST /api/feeds/:id/refresh
Authorization: Bearer <token>
```

### Entries

#### List Entries
```
GET /api/entries?status=unread&page=1&limit=50
Authorization: Bearer <token>
```

Query parameters:
- `status`: unread, read, removed
- `starred`: true/false
- `feed_id`: Filter by feed
- `category_id`: Filter by category
- `search`: Search in title/content
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 100)
- `order_by`: published_at, created_at
- `order_dir`: asc, desc

#### Get Entry
```
GET /api/entries/:id
Authorization: Bearer <token>
```

#### Update Entry Status
```
PUT /api/entries/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "read"
}
```

#### Toggle Star
```
POST /api/entries/:id/star
Authorization: Bearer <token>
```

#### Mark All as Read
```
POST /api/entries/mark-all-read
Authorization: Bearer <token>
Content-Type: application/json

{
  "feed_id": 1,  // optional
  "category_id": 1  // optional
}
```

#### Fetch Full Content
```
POST /api/entries/:id/fetch-content
Authorization: Bearer <token>
```

### Categories

#### List Categories
```
GET /api/categories
Authorization: Bearer <token>
```

#### Create Category
```
POST /api/categories
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Tech News"
}
```

#### Update Category
```
PUT /api/categories/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "New Name"
}
```

#### Delete Category
```
DELETE /api/categories/:id
Authorization: Bearer <token>
```

### Users (Admin Only)

#### List Users
```
GET /api/users
Authorization: Bearer <admin-token>
```

#### Create User
```
POST /api/users
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "username": "newuser",
  "password": "password123",
  "is_admin": false
}
```

## Integration with n8n

Macrofeed's REST API makes it easy to integrate with n8n for automation:

1. **Trigger on new entries**: Poll `/api/entries?status=unread` periodically
2. **Process entries**: Use the entry content in your workflows
3. **Mark as processed**: Update entry status via API
4. **Subscribe to feeds**: Add new feeds programmatically

Example n8n workflow:
1. HTTP Request node to fetch unread entries
2. Process each entry (send to Telegram, save to Notion, etc.)
3. HTTP Request node to mark entries as read

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Build for production
npm run build

# Run linter
npm run lint

# Run migrations
npm run migrate
```

## License

GPL-3.0 - See [LICENSE](LICENSE) for details.
