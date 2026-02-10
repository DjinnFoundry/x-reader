/** x-reader — Read-only Twitter/X API client */

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
} from './api/types.js';
export { resolveCookies } from './utils/auth.js';
export { formatTweets, formatTweet, extractTweetId } from './utils/format.js';
export { getQueryId, refreshQueryIds, getSnapshotInfo } from './api/query-ids.js';
