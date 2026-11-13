/** x-reader: Twitter/X API client (read, post and reply) */

export { XReaderClient } from './api/client.js';
export type {
  Tweet,
  TweetUrl,
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
