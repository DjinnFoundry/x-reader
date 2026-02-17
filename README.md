# x-reader

[![npm version](https://img.shields.io/npm/v/x-reader)](https://www.npmjs.com/package/x-reader)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)

**Read-only Twitter/X CLI** for searching tweets, reading timelines, bookmarks, and replies from the terminal. Inspired by [Bird CLI](https://github.com/steipete/bird).

> Uses your own X/Twitter cookies. One user, one account. No API keys required.

## Features

- **Search** tweets by keyword or advanced query (`from:`, `to:`, `filter:`, etc.)
- **Read** a user's timeline
- **Read** a single tweet by ID or URL
- **Read** replies to any tweet
- **Read** your bookmarks (with `--all` for full export)
- **Look up** user profiles by handle
- **JSON output** for piping into other tools (`jq`, scripts, etc.)
- **Auto-discovers** X's rotating GraphQL query IDs (no manual updates needed)
- **Zero config** beyond two browser cookies

## Why x-reader?

- No Twitter API keys or developer account needed
- Read-only by design (no accidental tweets, likes, or follows)
- Works with X's current GraphQL endpoints
- Lightweight: single dependency (Commander)
- Scriptable: JSON output for automation and data pipelines

## Install

### From npm (recommended)

```bash
npm install -g x-reader
```

### From source

```bash
git clone https://github.com/DjinnFoundry/x-reader.git
cd x-reader
npm install
npm run build
npm link
```

## Quick start

```bash
# 1. Set up authentication (interactive)
x-reader setup

# 2. Search tweets
x-reader search "machine learning"

# 3. Read a user's timeline
x-reader user-tweets @naval -n 10

# 4. Export your bookmarks as JSON
x-reader bookmarks --all --format json > bookmarks.json
```

## Authentication

You need two cookies from x.com: `auth_token` and `ct0`.

### Option 1: Interactive setup
```bash
x-reader setup
```

### Option 2: Environment variables
```bash
export AUTH_TOKEN="your_auth_token"
export CT0="your_ct0"
```

### Option 3: CLI flags
```bash
x-reader search "query" --auth-token xxx --ct0 yyy
```

### Where to find your cookies
1. Go to [x.com](https://x.com) and log in
2. Open DevTools (F12) -> Application -> Cookies -> x.com
3. Copy `auth_token` and `ct0` values

Config is saved to `~/.config/x-reader/config.json`.

## Usage

### Search tweets
```bash
x-reader search "machine learning"
x-reader search "from:elonmusk" -n 5
x-reader search "AI safety" --format json
```

### Read a user's timeline
```bash
x-reader user-tweets @steipete
x-reader user-tweets elonmusk -n 10
x-reader user-tweets @naval --format json
```

### Read a single tweet
```bash
x-reader read 1234567890
x-reader read https://x.com/user/status/1234567890
x-reader read https://x.com/user/status/1234567890 --format json
```

### Read replies
```bash
x-reader replies 1234567890
x-reader replies https://x.com/user/status/1234567890 --format json
```

### Export bookmarks
```bash
x-reader bookmarks
x-reader bookmarks -n 50
x-reader bookmarks --all --format json
```

### User lookup
```bash
x-reader user-lookup @steipete
x-reader user-lookup naval --format json
```

### Query ID management
```bash
# Show cached query IDs
x-reader query-ids

# Force refresh from x.com (when IDs rotate)
x-reader query-ids --refresh
```

## Output formats

- **text** (default) - human-readable
- **json** - machine-readable, pipe to `jq` or save to file

```bash
# Pipe to jq
x-reader search "typescript" --format json | jq '.tweets[].text'

# Save to file
x-reader bookmarks --all --format json > my-bookmarks.json
```

## Programmatic use

```typescript
import { XReaderClient } from 'x-reader';

const client = new XReaderClient({
  cookies: { authToken: '...', ct0: '...' },
});

const result = await client.search('hello world', 10);
console.log(result.tweets);
```

## How it works

X uses GraphQL endpoints with rotating query IDs embedded in their client-side JavaScript bundles. x-reader auto-discovers these IDs by scraping the JS bundles, caching them locally with a 24-hour TTL. No manual ID updates needed.

If you get 404 errors, force a refresh:
```bash
x-reader query-ids --refresh
```

## Architecture

```
src/
├── api/
│   ├── client.ts      # Main API client (read-only operations)
│   ├── constants.ts   # Bearer token, URLs, default query IDs
│   ├── features.ts    # GraphQL feature flags per operation
│   ├── parser.ts      # Response parsing (raw JSON -> Tweet/User)
│   ├── query-ids.ts   # Auto-discovery of query IDs from x.com JS
│   └── types.ts       # TypeScript interfaces
├── cli/
│   └── index.ts       # CLI entry point (commander)
├── utils/
│   ├── auth.ts        # Cookie resolution (env, config, bird compat)
│   └── format.ts      # Output formatting
└── index.ts           # Library exports
```

## Credits

- Inspired by [Bird CLI](https://github.com/steipete/bird) by [@steipete](https://x.com/steipete)
- Uses the same public bearer token as the X web client
- Query ID discovery mechanism reverse-engineered from Bird v0.8.0

## License

MIT
