/**
 * Output formatting — JSON and human-readable text.
 */

import type { Tweet } from '../api/types.js';

/** Format a tweet for human-readable output */
export function formatTweet(tweet: Tweet, separator = true): string {
  const lines: string[] = [];
  const header = `@${tweet.author.username} (${tweet.author.name})`;
  const date = tweet.createdAt ? `  ${tweet.createdAt}` : '';

  lines.push(`${header}${date}`);
  lines.push(tweet.text);

  const stats: string[] = [];
  if (tweet.likeCount !== undefined) stats.push(`❤️ ${tweet.likeCount}`);
  if (tweet.retweetCount !== undefined) stats.push(`🔁 ${tweet.retweetCount}`);
  if (tweet.replyCount !== undefined) stats.push(`💬 ${tweet.replyCount}`);
  if (stats.length > 0) lines.push(stats.join('  '));

  lines.push(`🔗 https://x.com/i/status/${tweet.id}`);

  if (tweet.quotedTweet) {
    lines.push(`  ↪ Quoting @${tweet.quotedTweet.author.username}: ${tweet.quotedTweet.text.slice(0, 100)}…`);
  }

  if (tweet.media?.length) {
    for (const m of tweet.media) {
      if (m.videoUrl) {
        lines.push(`  🎬 ${m.videoUrl}`);
      } else {
        lines.push(`  🖼️ ${m.url}`);
      }
    }
  }

  if (separator) lines.push('─'.repeat(50));
  return lines.join('\n');
}

/** Format tweets array for output */
export function formatTweets(tweets: Tweet[], options: { json?: boolean; emptyMessage?: string } = {}): string {
  if (options.json) {
    return JSON.stringify(tweets, null, 2);
  }

  if (tweets.length === 0) {
    return options.emptyMessage ?? 'No tweets found.';
  }

  return tweets.map((t) => formatTweet(t)).join('\n');
}

/** Extract tweet ID from URL or return as-is */
export function extractTweetId(input: string): string {
  const urlMatch = input.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  if (urlMatch) return urlMatch[1];
  if (/^\d+$/.test(input.trim())) return input.trim();
  throw new Error(`Invalid tweet ID or URL: ${input}`);
}

/** Normalize username — strip @ if present */
export function normalizeUsername(input: string): string {
  const trimmed = input.trim();
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}
