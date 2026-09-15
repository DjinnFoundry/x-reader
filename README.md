# x-reader

[![npm version](https://img.shields.io/npm/v/x-reader)](https://www.npmjs.com/package/x-reader)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)

**Twitter/X CLI** for searching posts, reading timelines, bookmarks and replies, and publishing original posts or replies from the terminal. Inspired by [Bird CLI](https://github.com/steipete/bird).

> Uses your own X/Twitter cookies. One user, one account. No API keys required.

## Features

- **Search** tweets by keyword or advanced query (`from:`, `to:`, `filter:`, etc.)
- **Read** a user's timeline
- **Read** a single tweet by ID or URL
- **Read** replies to any tweet
- **Read** your bookmarks (with `--all` for full export)
- **Look up** user profiles by handle
- **Publish** an original post or reply with up to 4 photos, 1 GIF, or 1 video
- **Stream video uploads** in 5 MiB chunks and wait for X processing to finish
- **Guard writes twice**: CLI permission flags plus an opt-in client API
- **JSON output** for piping into other tools (`jq`, scripts, etc.)
- **Auto-discovers** X's rotating GraphQL query IDs (no manual updates needed)
- **Zero config** beyond two browser cookies

## Why x-reader?

- No Twitter API keys or developer account needed
- Read-focused: only original posts and replies can write (no likes, retweets, follows, or deletes)
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

Config is saved to `~/.config/x-reader/config.json`. `setup` enforces mode `600` on the file and `700` on its directory.

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

### Publish an original post (write)
```bash
X_READER_ENABLE_POST=true x-reader post "A deliberately approved post"
X_READER_ENABLE_POST=true x-reader post "An approved image post" --media cover.png
X_READER_ENABLE_POST=true x-reader post "An approved video post" --media clip.mp4
```

### Post a reply (write)
```bash
X_READER_ENABLE_REPLY=true x-reader reply 1234567890 "Thanks for sharing!"
X_READER_ENABLE_REPLY=true x-reader reply https://x.com/user/status/1234567890 "Here's some context" --media chart.png
X_READER_ENABLE_REPLY=true x-reader reply 1234567890 "Done" --format json
```

`post` and `reply` are disabled by default. Prefer an operation-specific variable on the same command invocation:

- `X_READER_ENABLE_POST=true` enables only `post`.
- `X_READER_ENABLE_REPLY=true` enables only `reply`.
- `X_READER_ENABLE_WRITE=true` enables both and should be used only when that wider scope is intentional.

Do not export these variables globally. Enabling the capability is not approval for a particular remote write.

Media rules:

- Up to 4 photos (`jpg`, `jpeg`, `png`, or `webp`), each no larger than 5 MiB; `--media` is repeatable.
- Or exactly 1 GIF no larger than 15 MiB, without other media.
- Or exactly 1 video (`mp4`, `m4v`, or `mov`). A video cannot be mixed with images.
- Every attachment must exist, be a regular non-empty file, and pass validation before the first upload starts.
- Video is streamed from disk in 5 MiB segments using `INIT → APPEND → FINALIZE → STATUS`; the CLI reports upload and processing progress on stderr.
- X enforces account-specific upload and post limits separately. MP4 with H.264 video and AAC audio is the safest production target.
- Post/reply mutations are sent once and are never automatically retried after an ambiguous response, avoiding accidental duplicates.
- Threads, polls, likes, retweets, follows, and deletes are not implemented.

See X's [chunked media upload](https://docs.x.com/x-api/media/quickstart/media-upload-chunked) and [media best practices](https://docs.x.com/x-api/media/quickstart/best-practices). `x-reader` uses X's undocumented web/cookie authentication and legacy upload endpoint, so X can change compatibility without notice.

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
  enableWrites: true, // explicit opt-in; omit for read-only use
});

const result = await client.search('hello world', 10);
console.log(result.tweets);

// Publish an original post
const original = await client.createTweet('An explicitly approved post');

// Upload one video, then attach its media ID to a post
const video = await client.uploadMedia('clip.mp4', {
  onProgress: (progress) => console.error(progress),
});
const videoPost = await client.createTweet('An approved video', {
  mediaIds: video.mediaId ? [video.mediaId] : [],
});

// Post a reply (optionally with an uploaded image)
const up = await client.uploadMedia('chart.png');
const posted = await client.reply('1234567890', 'Here is the data', {
  mediaIds: up.mediaId ? [up.mediaId] : [],
});
console.log(posted.url);
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
│   ├── client.ts      # Main API client (reads + opt-in posts/replies)
│   ├── constants.ts   # Bearer token, URLs, default query IDs
│   ├── features.ts    # GraphQL feature flags per operation
│   ├── parser.ts      # Response parsing (raw JSON -> Tweet/User)
│   ├── query-ids.ts   # Auto-discovery of query IDs from x.com JS
│   └── types.ts       # TypeScript interfaces
├── cli/
│   └── index.ts       # CLI entry point (commander)
├── utils/
│   ├── auth.ts        # Cookie resolution (env, config, bird compat)
│   ├── media.ts       # Attachment validation and progress formatting
│   └── format.ts      # Output formatting
└── index.ts           # Library exports
```

## Credits

- Inspired by [Bird CLI](https://github.com/steipete/bird) by [@steipete](https://x.com/steipete)
- Uses the same public bearer token as the X web client

## License

MIT
