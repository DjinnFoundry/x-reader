/**
 * Parse Twitter/X GraphQL API responses into clean Tweet and User objects.
 * Extracted and cleaned up from Bird CLI v0.8.0.
 */

import type { Tweet, TweetMedia, User } from './types.js';

// ─── Text extraction ────────────────────────────────────────────

function firstNonEmpty(...values: (string | undefined | null)[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

/** Extract long-form note tweet text */
function extractNoteTweetText(result: any): string | undefined {
  const note = result?.note_tweet?.note_tweet_results?.result;
  if (!note) return undefined;
  return firstNonEmpty(
    note.text,
    note.richtext?.text,
    note.rich_text?.text,
    note.content?.text,
  );
}

/** Extract article text from tweet */
function extractArticleText(result: any): string | undefined {
  const article = result?.article;
  if (!article) return undefined;
  const inner = article.article_results?.result ?? article;
  const title = firstNonEmpty(inner.title, article.title);
  const plainText = firstNonEmpty(
    inner.plain_text, article.plain_text,
    inner.body?.text, inner.content?.text,
    article.body?.text, article.content?.text,
  );
  if (plainText && title && !plainText.startsWith(title)) {
    return `${title}\n${plainText}`;
  }
  return plainText ?? title;
}

/** Get the best text representation of a tweet */
function extractTweetText(result: any): string | undefined {
  return extractArticleText(result) ?? extractNoteTweetText(result) ?? firstNonEmpty(result?.legacy?.full_text);
}

// ─── Media extraction ───────────────────────────────────────────

function extractMedia(result: any): TweetMedia[] | undefined {
  const mediaEntities = result?.legacy?.extended_entities?.media ?? result?.legacy?.entities?.media;
  if (!mediaEntities?.length) return undefined;

  const items: TweetMedia[] = [];
  for (const m of mediaEntities) {
    if (!m.type || !m.media_url_https) continue;
    const item: TweetMedia = { type: m.type, url: m.media_url_https };

    const sizes = m.sizes;
    if (sizes?.large) {
      item.width = sizes.large.w;
      item.height = sizes.large.h;
    } else if (sizes?.medium) {
      item.width = sizes.medium.w;
      item.height = sizes.medium.h;
    }
    if (sizes?.small) {
      item.previewUrl = `${m.media_url_https}:small`;
    }

    if ((m.type === 'video' || m.type === 'animated_gif') && m.video_info?.variants) {
      const mp4s = m.video_info.variants.filter(
        (v: any) => v.content_type === 'video/mp4' && typeof v.url === 'string',
      );
      const best = mp4s
        .filter((v: any) => typeof v.bitrate === 'number')
        .sort((a: any, b: any) => b.bitrate - a.bitrate)[0] ?? mp4s[0];
      if (best) item.videoUrl = best.url;
      if (typeof m.video_info.duration_millis === 'number') {
        item.durationMs = m.video_info.duration_millis;
      }
    }
    items.push(item);
  }
  return items.length > 0 ? items : undefined;
}

// ─── Article preview ────────────────────────────────────────────

function extractArticlePreview(result: any): { title: string; previewText?: string } | undefined {
  const article = result?.article;
  if (!article) return undefined;
  const inner = article.article_results?.result ?? article;
  const title = firstNonEmpty(inner.title, article.title);
  if (!title) return undefined;
  const previewText = firstNonEmpty(inner.preview_text, article.preview_text);
  return { title, previewText };
}

// ─── Tweet parsing ──────────────────────────────────────────────

function unwrapTweet(obj: any): any {
  if (!obj) return undefined;
  if (obj.tweet) return obj.tweet;
  return obj;
}

/**
 * Parse a raw tweet result object into a clean Tweet.
 */
export function parseTweet(result: any, quoteDepth: number = 1, includeRaw = false): Tweet | undefined {
  const userResult = result?.core?.user_results?.result;
  const legacy = userResult?.legacy;
  const core = userResult?.core;
  const username = legacy?.screen_name ?? core?.screen_name;
  const name = legacy?.name ?? core?.name ?? username;
  const userId = userResult?.rest_id;

  if (!result?.rest_id || !username) return undefined;

  const text = extractTweetText(result);
  if (!text) return undefined;

  let quotedTweet: Tweet | undefined;
  if (quoteDepth > 0) {
    const quotedRaw = unwrapTweet(result.quoted_status_result?.result);
    if (quotedRaw) {
      quotedTweet = parseTweet(quotedRaw, quoteDepth - 1, includeRaw);
    }
  }

  const tweet: Tweet = {
    id: result.rest_id,
    text,
    createdAt: result.legacy?.created_at,
    replyCount: result.legacy?.reply_count,
    retweetCount: result.legacy?.retweet_count,
    likeCount: result.legacy?.favorite_count,
    conversationId: result.legacy?.conversation_id_str,
    inReplyToStatusId: result.legacy?.in_reply_to_status_id_str ?? undefined,
    author: { username, name: name || username },
    authorId: userId,
    quotedTweet,
    media: extractMedia(result),
    article: extractArticlePreview(result),
  };

  if (includeRaw) (tweet as any)._raw = result;
  return tweet;
}

// ─── Timeline instruction parsing ───────────────────────────────

function extractTweetResultsFromEntry(entry: any): any[] {
  const results: any[] = [];
  const push = (r: any) => { if (r?.rest_id) results.push(r); };
  const content = entry.content;

  push(content?.itemContent?.tweet_results?.result);
  push(content?.item?.itemContent?.tweet_results?.result);

  for (const item of content?.items ?? []) {
    push(item?.item?.itemContent?.tweet_results?.result);
    push(item?.itemContent?.tweet_results?.result);
    push(item?.content?.itemContent?.tweet_results?.result);
  }
  return results;
}

/**
 * Parse tweets from timeline instructions array.
 */
export function parseTweetsFromInstructions(
  instructions: any[] | undefined,
  quoteDepth = 1,
  includeRaw = false,
): Tweet[] {
  const tweets: Tweet[] = [];
  const seen = new Set<string>();

  for (const inst of instructions ?? []) {
    for (const entry of inst.entries ?? []) {
      const rawTweets = extractTweetResultsFromEntry(entry);
      for (const raw of rawTweets) {
        const tweet = parseTweet(raw, quoteDepth, includeRaw);
        if (!tweet || seen.has(tweet.id)) continue;
        seen.add(tweet.id);
        tweets.push(tweet);
      }
    }
  }
  return tweets;
}

/**
 * Extract cursor from timeline instructions.
 */
export function extractCursor(instructions: any[] | undefined, type = 'Bottom'): string | undefined {
  for (const inst of instructions ?? []) {
    for (const entry of inst.entries ?? []) {
      const content = entry.content;
      if (content?.cursorType === type && typeof content.value === 'string' && content.value.length > 0) {
        return content.value;
      }
    }
  }
  return undefined;
}

/**
 * Parse users from timeline instructions (for followers/following).
 */
export function parseUsersFromInstructions(instructions: any[] | undefined): User[] {
  if (!instructions) return [];
  const users: User[] = [];

  for (const inst of instructions) {
    if (!inst.entries) continue;
    for (const entry of inst.entries) {
      const userResult = entry?.content?.itemContent?.user_results?.result;
      const resolved =
        userResult?.__typename === 'UserWithVisibilityResults' && userResult.user
          ? userResult.user
          : userResult;

      if (!resolved || resolved.__typename !== 'User') continue;
      const { legacy, core } = resolved;
      const username = legacy?.screen_name ?? core?.screen_name;
      if (!resolved.rest_id || !username) continue;

      users.push({
        id: resolved.rest_id,
        username,
        name: legacy?.name ?? core?.name ?? username,
        description: legacy?.description,
        followersCount: legacy?.followers_count,
        followingCount: legacy?.friends_count,
        isBlueVerified: resolved.is_blue_verified,
        profileImageUrl: legacy?.profile_image_url_https ?? resolved.avatar?.image_url,
        createdAt: legacy?.created_at ?? core?.created_at,
      });
    }
  }
  return users;
}

/** Find a specific tweet result by ID in instructions */
export function findTweetInInstructions(instructions: any[] | undefined, tweetId: string): any | undefined {
  if (!instructions) return undefined;
  for (const inst of instructions) {
    for (const entry of inst.entries ?? []) {
      const raw = entry.content?.itemContent?.tweet_results?.result;
      if (raw?.rest_id === tweetId) return raw;
    }
  }
  return undefined;
}
