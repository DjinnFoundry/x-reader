/**
 * XReader API Client — Read-only Twitter/X GraphQL client.
 *
 * Provides: search, user-tweets, tweet-detail, replies, bookmarks, user-lookup.
 * Does NOT provide any write operations (tweet, like, retweet, follow, etc.)
 */

import { randomBytes, randomUUID } from 'crypto';
import type {
  ClientOptions,
  Tweet,
  TweetsResult,
  TweetResult,
  User,
  UserResult,
} from './types.js';
import { BEARER_TOKEN, GRAPHQL_URL, USER_AGENT, DEFAULT_QUERY_IDS } from './constants.js';
import { getQueryId, refreshQueryIds } from './query-ids.js';
import {
  tweetDetailFeatures,
  searchFeatures,
  userTweetsFeatures,
  bookmarksFeatures,
  tweetDetailFieldToggles,
} from './features.js';
import {
  parseTweet,
  parseTweetsFromInstructions,
  extractCursor,
  findTweetInInstructions,
} from './parser.js';

export class XReaderClient {
  private authToken: string;
  private ct0: string;
  private cookieHeader: string;
  private userAgent: string;
  private timeoutMs?: number;
  private quoteDepth: number;
  private clientUuid: string;

  constructor(options: ClientOptions) {
    if (!options.cookies.authToken || !options.cookies.ct0) {
      throw new Error('Both authToken and ct0 cookies are required');
    }
    this.authToken = options.cookies.authToken;
    this.ct0 = options.cookies.ct0;
    this.cookieHeader =
      options.cookies.cookieHeader || `auth_token=${this.authToken}; ct0=${this.ct0}`;
    this.userAgent = USER_AGENT;
    this.timeoutMs = options.timeoutMs;
    this.quoteDepth = Math.max(0, Math.floor(options.quoteDepth ?? 1));
    this.clientUuid = randomUUID();
  }

  // ─── HTTP helpers ───────────────────────────────────────────

  private getHeaders(): Record<string, string> {
    return {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      authorization: `Bearer ${BEARER_TOKEN}`,
      'x-csrf-token': this.ct0,
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en',
      'x-client-uuid': this.clientUuid,
      'x-client-transaction-id': randomBytes(16).toString('hex'),
      cookie: this.cookieHeader,
      'user-agent': this.userAgent,
      'content-type': 'application/json',
      origin: 'https://x.com',
      referer: 'https://x.com/',
    };
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    if (!this.timeoutMs || this.timeoutMs <= 0) {
      return fetch(url, init);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Query ID helpers ─────────────────────────────────────────

  private async getQueryIds(operation: string): Promise<string[]> {
    const discovered = await getQueryId(operation);
    const fallback = DEFAULT_QUERY_IDS[operation];
    const ids = new Set<string>();
    if (discovered) ids.add(discovered);
    if (fallback) ids.add(fallback);
    return [...ids];
  }

  /**
   * Try a request with multiple query IDs, auto-refresh on 404.
   */
  private async tryWithQueryIds<T>(
    operation: string,
    extraIds: string[],
    doRequest: (queryId: string) => Promise<{ result: T | null; status: number; error?: string }>,
  ): Promise<T> {
    const ids = await this.getQueryIds(operation);
    for (const extra of extraIds) ids.push(extra);
    const uniqueIds = [...new Set(ids)];

    let lastError = '';
    let had404 = false;

    for (const qid of uniqueIds) {
      const { result, status, error } = await doRequest(qid);
      if (result !== null) return result;
      if (status === 404) had404 = true;
      if (error) lastError = error;
    }

    // If we got 404s, refresh and retry
    if (had404) {
      await refreshQueryIds({ force: true });
      const freshIds = await this.getQueryIds(operation);
      for (const qid of freshIds) {
        const { result, error } = await doRequest(qid);
        if (result !== null) return result;
        if (error) lastError = error;
      }
    }

    throw new Error(lastError || `Failed to execute ${operation}`);
  }

  // ─── Search ───────────────────────────────────────────────────

  async search(
    query: string,
    count = 20,
    options: { cursor?: string; includeRaw?: boolean } = {},
  ): Promise<TweetsResult> {
    const features = searchFeatures();
    const includeRaw = options.includeRaw ?? false;

    try {
      return await this.tryWithQueryIds('SearchTimeline', [], async (qid) => {
        const variables: Record<string, unknown> = {
          rawQuery: query,
          count: Math.min(count, 20),
          querySource: 'typed_query',
          product: 'Latest',
        };
        if (options.cursor) variables.cursor = options.cursor;

        const params = new URLSearchParams({ variables: JSON.stringify(variables) });
        const url = `${GRAPHQL_URL}/${qid}/SearchTimeline?${params}`;

        const resp = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ features, queryId: qid }),
        });

        if (resp.status === 404) return { result: null, status: 404 };
        if (!resp.ok) {
          const body = await resp.text();
          return { result: null, status: resp.status, error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
        }

        const data = await resp.json();
        if (data.errors?.length) {
          return { result: null, status: 200, error: data.errors.map((e: any) => e.message).join(', ') };
        }

        const instructions = data.data?.search_by_raw_query?.search_timeline?.timeline?.instructions;
        const tweets = parseTweetsFromInstructions(instructions, this.quoteDepth, includeRaw);
        const nextCursor = extractCursor(instructions);

        return { result: { success: true, tweets, nextCursor } as TweetsResult, status: 200 };
      });
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ─── Tweet Detail ─────────────────────────────────────────────

  async getTweet(tweetId: string, options: { includeRaw?: boolean } = {}): Promise<TweetResult> {
    const includeRaw = options.includeRaw ?? false;

    try {
      return await this.tryWithQueryIds('TweetDetail', ['aFvUsJm2c-oDkJV75blV6g'], async (qid) => {
        const variables = {
          focalTweetId: tweetId,
          with_rux_injections: false,
          rankingMode: 'Relevance',
          includePromotedContent: true,
          withCommunity: true,
          withQuickPromoteEligibilityTweetFields: true,
          withBirdwatchNotes: true,
          withVoice: true,
        };

        const features = {
          ...tweetDetailFeatures(),
          articles_preview_enabled: true,
          articles_rest_api_enabled: true,
          rweb_video_timestamps_enabled: true,
        };

        const fieldToggles = tweetDetailFieldToggles();

        const params = new URLSearchParams({
          variables: JSON.stringify(variables),
          features: JSON.stringify(features),
          fieldToggles: JSON.stringify(fieldToggles),
        });

        const url = `${GRAPHQL_URL}/${qid}/TweetDetail?${params}`;
        const resp = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.getHeaders(),
        });

        if (resp.status === 404) return { result: null, status: 404 };
        if (!resp.ok) {
          const body = await resp.text();
          return { result: null, status: resp.status, error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
        }

        const data = await resp.json();
        const instructions = data.data?.threaded_conversation_with_injections_v2?.instructions;
        const tweetResult = data.data?.tweetResult?.result ?? findTweetInInstructions(instructions, tweetId);
        const tweet = parseTweet(tweetResult, this.quoteDepth, includeRaw);

        if (tweet) {
          return { result: { success: true, tweet } as TweetResult, status: 200 };
        }
        return { result: null, status: 200, error: 'Tweet not found in response' };
      });
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ─── Replies ──────────────────────────────────────────────────

  async getReplies(tweetId: string, options: { includeRaw?: boolean } = {}): Promise<TweetsResult> {
    const includeRaw = options.includeRaw ?? false;

    try {
      return await this.tryWithQueryIds('TweetDetail', [], async (qid) => {
        const variables = {
          focalTweetId: tweetId,
          with_rux_injections: false,
          rankingMode: 'Relevance',
          includePromotedContent: true,
          withCommunity: true,
          withQuickPromoteEligibilityTweetFields: true,
          withBirdwatchNotes: true,
          withVoice: true,
        };

        const features = {
          ...tweetDetailFeatures(),
          articles_preview_enabled: true,
          rweb_video_timestamps_enabled: true,
        };

        const fieldToggles = tweetDetailFieldToggles();
        const params = new URLSearchParams({
          variables: JSON.stringify(variables),
          features: JSON.stringify(features),
          fieldToggles: JSON.stringify(fieldToggles),
        });

        const url = `${GRAPHQL_URL}/${qid}/TweetDetail?${params}`;
        const resp = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.getHeaders(),
        });

        if (resp.status === 404) return { result: null, status: 404 };
        if (!resp.ok) {
          const body = await resp.text();
          return { result: null, status: resp.status, error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
        }

        const data = await resp.json();
        const instructions = data.data?.threaded_conversation_with_injections_v2?.instructions;
        const allTweets = parseTweetsFromInstructions(instructions, this.quoteDepth, includeRaw);
        const replies = allTweets.filter((t) => t.inReplyToStatusId === tweetId);

        return { result: { success: true, tweets: replies } as TweetsResult, status: 200 };
      });
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ─── User Tweets ──────────────────────────────────────────────

  async getUserTweets(
    userId: string,
    count = 20,
    options: { cursor?: string; includeRaw?: boolean } = {},
  ): Promise<TweetsResult> {
    const features = userTweetsFeatures();
    const includeRaw = options.includeRaw ?? false;

    try {
      return await this.tryWithQueryIds('UserTweets', [], async (qid) => {
        const variables: Record<string, unknown> = {
          userId,
          count: Math.min(count, 20),
          includePromotedContent: false,
          withQuickPromoteEligibilityTweetFields: true,
          withVoice: true,
        };
        if (options.cursor) variables.cursor = options.cursor;

        const params = new URLSearchParams({
          variables: JSON.stringify(variables),
          features: JSON.stringify(features),
          fieldToggles: JSON.stringify({ withArticlePlainText: false }),
        });

        const url = `${GRAPHQL_URL}/${qid}/UserTweets?${params}`;
        const resp = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.getHeaders(),
        });

        if (resp.status === 404) return { result: null, status: 404 };
        if (!resp.ok) {
          const body = await resp.text();
          return { result: null, status: resp.status, error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
        }

        const data = await resp.json();
        if (data.errors?.length) {
          const msg = data.errors.map((e: any) => e.message).join(', ');
          if (msg.includes('suspended') || msg.includes('not found')) {
            return { result: { success: false, error: msg } as TweetsResult, status: 200 };
          }
        }

        const instructions = data.data?.user?.result?.timeline?.timeline?.instructions;
        const tweets = parseTweetsFromInstructions(instructions, this.quoteDepth, includeRaw);
        const nextCursor = extractCursor(instructions);

        return { result: { success: true, tweets, nextCursor } as TweetsResult, status: 200 };
      });
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ─── Bookmarks ────────────────────────────────────────────────

  async getBookmarks(
    count = 20,
    options: { cursor?: string; includeRaw?: boolean } = {},
  ): Promise<TweetsResult> {
    const features = bookmarksFeatures();
    const includeRaw = options.includeRaw ?? false;

    try {
      return await this.tryWithQueryIds('Bookmarks', ['tmd4ifV8RHltzn8ymGg1aw'], async (qid) => {
        const variables: Record<string, unknown> = {
          count: Math.min(count, 20),
          includePromotedContent: false,
          withDownvotePerspective: false,
          withReactionsMetadata: false,
          withReactionsPerspective: false,
        };
        if (options.cursor) variables.cursor = options.cursor;

        const params = new URLSearchParams({
          variables: JSON.stringify(variables),
          features: JSON.stringify(features),
        });

        const url = `${GRAPHQL_URL}/${qid}/Bookmarks?${params}`;
        const resp = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.getHeaders(),
        });

        if (resp.status === 404) return { result: null, status: 404 };
        if (!resp.ok) {
          const body = await resp.text();
          return { result: null, status: resp.status, error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
        }

        const data = await resp.json();
        const instructions = data.data?.bookmark_timeline_v2?.timeline?.instructions;
        const tweets = parseTweetsFromInstructions(instructions, this.quoteDepth, includeRaw);
        const nextCursor = extractCursor(instructions);

        return { result: { success: true, tweets, nextCursor } as TweetsResult, status: 200 };
      });
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ─── User Lookup ──────────────────────────────────────────────

  async getUserByUsername(username: string): Promise<UserResult> {
    const handle = username.startsWith('@') ? username.slice(1) : username;

    const graphqlIds = ['xc8f1g7BYqr6VTzTbvNlGw', 'qW5u-DAuXpMEG0zA1F7UGQ', 'sLVLhk0bGj3MVFEKTdax1w'];
    const variables = { screen_name: handle, withSafetyModeUserFields: true };
    const features = {
      hidden_profile_subscriptions_enabled: true,
      hidden_profile_likes_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      subscriptions_verification_info_is_identity_verified_enabled: true,
      subscriptions_verification_info_verified_since_enabled: true,
      highlights_tweets_tab_ui_enabled: true,
      responsive_web_twitter_article_notes_tab_enabled: true,
      subscriptions_feature_can_gift_premium: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
      blue_business_profile_image_shape_enabled: true,
    };
    const fieldToggles = { withAuxiliaryUserLabels: false };

    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(features),
      fieldToggles: JSON.stringify(fieldToggles),
    });

    let lastError = '';

    for (const qid of graphqlIds) {
      try {
        const url = `${GRAPHQL_URL}/${qid}/UserByScreenName?${params}`;
        const resp = await this.fetchWithTimeout(url, {
          method: 'GET',
          headers: this.getHeaders(),
        });

        if (!resp.ok) {
          lastError = `HTTP ${resp.status}`;
          continue;
        }

        const data = await resp.json();

        if (data.data?.user?.result?.__typename === 'UserUnavailable') {
          return { success: false, error: `User @${handle} not found or unavailable` };
        }

        const user = data.data?.user?.result;
        const id = user?.rest_id;
        const screenName = user?.legacy?.screen_name ?? user?.core?.screen_name;
        const name = user?.legacy?.name ?? user?.core?.name;

        if (id && screenName) {
          return { success: true, userId: id, username: screenName, name };
        }

        if (data.errors?.length) {
          lastError = data.errors.map((e: any) => e.message).join(', ');
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    // REST API fallback
    const restUrls = [
      `https://x.com/i/api/1.1/users/show.json?screen_name=${encodeURIComponent(handle)}`,
      `https://api.twitter.com/1.1/users/show.json?screen_name=${encodeURIComponent(handle)}`,
    ];

    for (const restUrl of restUrls) {
      try {
        const resp = await this.fetchWithTimeout(restUrl, {
          method: 'GET',
          headers: this.getHeaders(),
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        const id = data.id_str ?? (data.id ? String(data.id) : null);
        if (id) {
          return { success: true, userId: id, username: data.screen_name ?? handle, name: data.name };
        }
      } catch {
        // Try next
      }
    }

    return { success: false, error: lastError || 'Unknown error looking up user' };
  }

  // ─── Paginated helpers ────────────────────────────────────────

  /**
   * Search with automatic pagination to collect up to `count` tweets.
   */
  async searchAll(
    query: string,
    count: number,
    options: { maxPages?: number; includeRaw?: boolean } = {},
  ): Promise<TweetsResult> {
    const all: Tweet[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;

    while (all.length < count) {
      const pageSize = Math.min(20, count - all.length);
      const result = await this.search(query, pageSize, { cursor, includeRaw: options.includeRaw });
      if (!result.success) return { success: false, error: result.error };

      pages++;
      let added = 0;
      for (const t of result.tweets ?? []) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        all.push(t);
        added++;
        if (all.length >= count) break;
      }

      if (!result.nextCursor || result.nextCursor === cursor || added === 0) break;
      if (options.maxPages && pages >= options.maxPages) {
        return { success: true, tweets: all, nextCursor: result.nextCursor };
      }
      cursor = result.nextCursor;
    }

    return { success: true, tweets: all };
  }

  /**
   * Get user tweets with pagination.
   */
  async getUserTweetsAll(
    userId: string,
    count: number,
    options: { maxPages?: number; includeRaw?: boolean } = {},
  ): Promise<TweetsResult> {
    const all: Tweet[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;

    while (all.length < count) {
      const pageSize = Math.min(20, count - all.length);
      const result = await this.getUserTweets(userId, pageSize, { cursor, includeRaw: options.includeRaw });
      if (!result.success) return { success: false, error: result.error };

      pages++;
      let added = 0;
      for (const t of result.tweets ?? []) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        all.push(t);
        added++;
        if (all.length >= count) break;
      }

      if (!result.nextCursor || result.nextCursor === cursor || added === 0) break;
      if (options.maxPages && pages >= options.maxPages) {
        return { success: true, tweets: all, nextCursor: result.nextCursor };
      }
      cursor = result.nextCursor;
      await this.sleep(1000);
    }

    return { success: true, tweets: all };
  }

  /**
   * Get all bookmarks with pagination.
   */
  async getBookmarksAll(
    count: number = Infinity,
    options: { maxPages?: number; includeRaw?: boolean } = {},
  ): Promise<TweetsResult> {
    const all: Tweet[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;

    while (all.length < count) {
      const result = await this.getBookmarks(20, { cursor, includeRaw: options.includeRaw });
      if (!result.success) return { success: false, error: result.error };

      pages++;
      let added = 0;
      for (const t of result.tweets ?? []) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        all.push(t);
        added++;
        if (all.length >= count) break;
      }

      if (!result.nextCursor || result.nextCursor === cursor || added === 0) break;
      if (options.maxPages && pages >= options.maxPages) {
        return { success: true, tweets: all, nextCursor: result.nextCursor };
      }
      cursor = result.nextCursor;
      await this.sleep(500);
    }

    return { success: true, tweets: all };
  }
}
