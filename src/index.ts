/** x-reader — Twitter/X API client (read + reply) */

export { XReaderClient } from './api/client.js';
export type {
  Tweet,
  TweetMedia,
  User,
  Cookies,
  ClientOptions,
  TweetResult,
  TweetsResult,
  UserResult,
  PostResult,
  MediaUploadResult,
} from './api/types.js';
export { resolveCookies } from './utils/auth.js';
export { formatTweets, formatTweet, extractTweetId } from './utils/format.js';
export { getQueryId, refreshQueryIds, getSnapshotInfo } from './api/query-ids.js';
