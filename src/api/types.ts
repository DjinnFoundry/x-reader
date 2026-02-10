/** Core types for x-reader */

export interface Tweet {
  id: string;
  text: string;
  createdAt?: string;
  replyCount?: number;
  retweetCount?: number;
  likeCount?: number;
  conversationId?: string;
  inReplyToStatusId?: string;
  author: {
    username: string;
    name: string;
  };
  authorId?: string;
  quotedTweet?: Tweet;
  media?: TweetMedia[];
  article?: { title: string; previewText?: string };
  _raw?: unknown;
}

export interface TweetMedia {
  type: string;
  url: string;
  width?: number;
  height?: number;
  previewUrl?: string;
  videoUrl?: string;
  durationMs?: number;
}

export interface User {
  id: string;
  username: string;
  name: string;
  description?: string;
  followersCount?: number;
  followingCount?: number;
  isBlueVerified?: boolean;
  profileImageUrl?: string;
  createdAt?: string;
}

export interface Cookies {
  authToken: string;
  ct0: string;
  cookieHeader?: string;
  source?: string;
}

export interface ClientOptions {
  cookies: Cookies;
  timeoutMs?: number;
  quoteDepth?: number;
}

export interface ApiResult<T> {
  success: boolean;
  error?: string;
  tweets?: Tweet[];
  tweet?: Tweet;
  users?: User[];
  user?: User;
  nextCursor?: string;
  items?: T[];
}

export interface TweetResult {
  success: boolean;
  error?: string;
  tweet?: Tweet;
}

export interface TweetsResult {
  success: boolean;
  error?: string;
  tweets?: Tweet[];
  nextCursor?: string;
}

export interface UserResult {
  success: boolean;
  error?: string;
  userId?: string;
  username?: string;
  name?: string;
}

export interface QueryIdCache {
  fetchedAt: string;
  ttlMs: number;
  ids: Record<string, string>;
  discovery: {
    pages: string[];
    bundles: string[];
  };
}
