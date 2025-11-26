# Macrofeed

Lightweight RSS Aggregator - A minimalist feed reader API.

Macrofeed is a lightweight, self-hosted RSS/Atom/JSON Feed aggregator designed for simplicity and ease of integration. Perfect for home labs, automation with n8n, and personal use.

## Description

Macrofeed is an ultra-lightweight RSS aggregator that stores only article metadata (title, URL, date, etc.) and fetches full content on-demand when you want to read an article. This keeps the database small while providing access to full article content when needed.

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

The API will be available at `http://localhost:3000/api`

### Production

```bash
# Build
npm run build

# Start
npm start
```

## License

GPL-3.0 - See [LICENSE](LICENSE) for details.
