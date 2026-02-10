# x-reader

**Read-only Twitter/X CLI** — personal tool for reading tweets, inspired by [Bird CLI](https://github.com/steipete/bird).

> ⚠️ This is for personal use with your own cookies. One user, one account.

## What it does

- **Search** tweets by keyword or advanced query
- **Read** a user's tweets
- **Read** a single tweet by ID or URL
- **Read** replies to a tweet
- **Read** your bookmarks
- **Look up** user info by handle

## What it does NOT do

No writing. No tweeting, liking, retweeting, following, or any mutation.
This is a **read-only** tool.

## Install

```bash
# Clone and build
cd ~/foundry/x-reader
npm install
npm run build
npm link    # makes `x-reader` available globally
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

### Where to find cookies
1. Go to [x.com](https://x.com) and log in
2. Open DevTools → Application → Cookies → x.com
3. Copy `auth_token` and `ct0` values

Config is saved to `~/.config/x-reader/config.json`.

## Usage

### Search
```bash
x-reader search "machine learning"
x-reader search "from:elonmusk" -n 5
x-reader search "AI safety" --format json
```

### User tweets
```bash
x-reader user-tweets @steipete
x-reader user-tweets elonmusk -n 10
x-reader user-tweets @naval --format json
```

### Read a tweet
```bash
x-reader read 1234567890
x-reader read https://x.com/user/status/1234567890
x-reader read https://x.com/user/status/1234567890 --format json
```

### Replies
```bash
x-reader replies 1234567890
x-reader replies https://x.com/user/status/1234567890 --format json
```

### Bookmarks
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

- **text** (default) — Human-readable with emoji
- **json** — Machine-readable JSON

Use `--format json` on any command.

## Query ID Auto-Discovery

X periodically rotates the GraphQL query IDs in their JS bundles.
x-reader auto-discovers these by scraping x.com's client-side JavaScript,
just like Bird CLI does. The IDs are cached in `~/.config/x-reader/query-ids-cache.json`
with a 24-hour TTL.

If you get 404 errors, run:
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
│   ├── parser.ts      # Response parsing (raw JSON → Tweet/User)
│   ├── query-ids.ts   # Auto-discovery of query IDs from x.com JS
│   └── types.ts       # TypeScript interfaces
├── cli/
│   └── index.ts       # CLI entry point (commander)
├── utils/
│   ├── auth.ts        # Cookie resolution (env, config, bird compat)
│   └── format.ts      # Output formatting
└── index.ts           # Library exports
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

## Credits

- Inspired by [Bird CLI](https://github.com/steipete/bird) by [@steipete](https://x.com/steipete)
- Uses the same public bearer token as the X web client
- Query ID discovery mechanism reverse-engineered from Bird v0.8.0

## License

MIT
