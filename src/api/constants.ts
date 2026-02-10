/** Constants extracted from Bird CLI v0.8.0 */

/** Public bearer token — same one the X web client uses */
export const BEARER_TOKEN =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

/** GraphQL API base */
export const GRAPHQL_URL = 'https://x.com/i/api/graphql';

/** Default User-Agent */
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Fallback query IDs — these get rotated by X periodically */
export const DEFAULT_QUERY_IDS: Record<string, string> = {
  TweetDetail: '97JF30KziU00483E_8elBA',
  SearchTimeline: 'M1jEez78PEfVfbQLvlWMvQ',
  UserTweets: 'Wms1GvIiHXAPBaCr9KblaA',
  UserArticlesTweets: '8zBy9h4L90aDL02RsBcCFg',
  Bookmarks: 'RV1g3b8n_SGOHwkqKYSCFw',
  BookmarkFolderTimeline: 'KJIQpsvxrTfRIlbaRIySHQ',
  Following: 'BEkNpEt5pNETESoqMsTEGA',
  Followers: 'kuFUYP9eV1FPoEy4N-pi7w',
  Likes: 'JR2gceKucIKcVNB_9JkhsA',
  HomeTimeline: 'edseUwk9sP5Phz__9TIRnA',
  HomeLatestTimeline: 'iOEZpOdfekFsxSlPQCQtPg',
  GenericTimelineById: 'uGSr7alSjR9v6QJAIaqSKQ',
  AboutAccountQuery: 'zs_jFPFT78rBpXv9Z3U2YQ',
};

/** Operation names we care about for query ID discovery */
export const DISCOVERY_OPERATIONS = Object.keys(DEFAULT_QUERY_IDS);

/** Pages to scrape for JS bundle URLs */
export const DISCOVERY_PAGES = [
  'https://x.com/?lang=en',
  'https://x.com/explore',
  'https://x.com/notifications',
  'https://x.com/settings/profile',
];

/** Regex to find client JS bundles */
export const BUNDLE_URL_REGEX =
  /https:\/\/abs\.twimg\.com\/responsive-web\/client-web(?:-legacy)?\/[A-Za-z0-9.-]+\.js/g;

/** Regex patterns to extract queryId + operationName from bundles */
export const QUERY_ID_PATTERNS = [
  {
    regex: /e\.exports=\{queryId\s*:\s*["']([^"']+)["']\s*,\s*operationName\s*:\s*["']([^"']+)["']/g,
    operationGroup: 2,
    queryIdGroup: 1,
  },
  {
    regex: /e\.exports=\{operationName\s*:\s*["']([^"']+)["']\s*,\s*queryId\s*:\s*["']([^"']+)["']/g,
    operationGroup: 1,
    queryIdGroup: 2,
  },
  {
    regex: /operationName\s*[:=]\s*["']([^"']+)["'](.{0,4000}?)queryId\s*[:=]\s*["']([^"']+)["']/g,
    operationGroup: 1,
    queryIdGroup: 3,
  },
  {
    regex: /queryId\s*[:=]\s*["']([^"']+)["'](.{0,4000}?)operationName\s*[:=]\s*["']([^"']+)["']/g,
    operationGroup: 3,
    queryIdGroup: 1,
  },
];

/** Cache TTL for query IDs — 24 hours */
export const QUERY_ID_TTL_MS = 86400000;
