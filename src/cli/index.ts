#!/usr/bin/env node

/**
 * x-reader CLI — Read-only Twitter/X client
 *
 * Commands:
 *   search <query>              Search tweets
 *   user-tweets <handle>        Get tweets from a user
 *   read <tweet-id-or-url>      Read a single tweet
 *   replies <tweet-id-or-url>   Get replies to a tweet
 *   bookmarks                   Get your bookmarks
 *   user-lookup <handle>        Look up user info
 *   query-ids                   Show/refresh cached query IDs
 *   setup                       Configure authentication
 */

import { Command } from 'commander';
import { XReaderClient } from '../api/client.js';
import { resolveCookies } from '../utils/auth.js';
import { formatTweets, formatTweet, extractTweetId, normalizeUsername } from '../utils/format.js';
import { getSnapshotInfo, refreshQueryIds } from '../api/query-ids.js';
import { writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline';

const VERSION = '0.1.0';

const program = new Command();

program
  .name('x-reader')
  .description('Read-only Twitter/X CLI — personal tool for reading tweets')
  .version(VERSION)
  .option('--auth-token <token>', 'Twitter auth_token cookie')
  .option('--ct0 <token>', 'Twitter ct0 cookie')
  .option('--timeout <ms>', 'Request timeout in milliseconds');

// ─── Helper to create client ──────────────────────────────────

async function createClient(opts: any): Promise<XReaderClient> {
  const { cookies, warnings } = await resolveCookies({
    authToken: opts.authToken,
    ct0: opts.ct0,
  });

  for (const w of warnings) {
    console.error(`⚠️  ${w}`);
  }

  if (!cookies.authToken || !cookies.ct0) {
    console.error('❌ Missing credentials. Run `x-reader setup` or set AUTH_TOKEN and CT0 env vars.');
    process.exit(1);
  }

  return new XReaderClient({
    cookies,
    timeoutMs: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
  });
}

// ─── search ─────────────────────────────────────────────────────

program
  .command('search <query>')
  .description('Search for tweets')
  .option('-n, --count <number>', 'Number of tweets', '10')
  .option('--format <type>', 'Output format: json or text', 'text')
  .action(async (query: string, cmdOpts: any) => {
    const opts = program.opts();
    const client = await createClient(opts);
    const count = parseInt(cmdOpts.count, 10);
    const result = await client.searchAll(query, count);

    if (!result.success) {
      console.error(`❌ Search failed: ${result.error}`);
      process.exit(1);
    }

    const isJson = cmdOpts.format === 'json';
    console.log(formatTweets(result.tweets ?? [], { json: isJson }));
  });

// ─── user-tweets ────────────────────────────────────────────────

program
  .command('user-tweets <handle>')
  .description('Get tweets from a user')
  .option('-n, --count <number>', 'Number of tweets', '20')
  .option('--format <type>', 'Output format: json or text', 'text')
  .action(async (handle: string, cmdOpts: any) => {
    const opts = program.opts();
    const client = await createClient(opts);
    const username = normalizeUsername(handle);
    const count = parseInt(cmdOpts.count, 10);

    // Look up user ID first
    console.error(`ℹ️  Looking up @${username}...`);
    const user = await client.getUserByUsername(username);
    if (!user.success || !user.userId) {
      console.error(`❌ ${user.error || `User @${username} not found`}`);
      process.exit(1);
    }

    console.error(`ℹ️  Fetching tweets from ${user.name} (@${user.username})...`);
    const result = await client.getUserTweetsAll(user.userId, count);

    if (!result.success) {
      console.error(`❌ Failed: ${result.error}`);
      process.exit(1);
    }

    const isJson = cmdOpts.format === 'json';
    console.log(formatTweets(result.tweets ?? [], { json: isJson, emptyMessage: `No tweets found for @${username}.` }));
  });

// ─── read ───────────────────────────────────────────────────────

program
  .command('read <tweet-id-or-url>')
  .description('Read a single tweet')
  .option('--format <type>', 'Output format: json or text', 'text')
  .action(async (input: string, cmdOpts: any) => {
    const opts = program.opts();
    const client = await createClient(opts);

    let tweetId: string;
    try { tweetId = extractTweetId(input); } catch (e) {
      console.error(`❌ ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }

    const result = await client.getTweet(tweetId);
    if (!result.success || !result.tweet) {
      console.error(`❌ ${result.error || 'Tweet not found'}`);
      process.exit(1);
    }

    if (cmdOpts.format === 'json') {
      console.log(JSON.stringify(result.tweet, null, 2));
    } else {
      console.log(formatTweet(result.tweet, false));
    }
  });

// ─── replies ────────────────────────────────────────────────────

program
  .command('replies <tweet-id-or-url>')
  .description('Get replies to a tweet')
  .option('--format <type>', 'Output format: json or text', 'text')
  .action(async (input: string, cmdOpts: any) => {
    const opts = program.opts();
    const client = await createClient(opts);

    let tweetId: string;
    try { tweetId = extractTweetId(input); } catch (e) {
      console.error(`❌ ${e instanceof Error ? e.message : e}`);
      process.exit(1);
    }

    const result = await client.getReplies(tweetId);
    if (!result.success) {
      console.error(`❌ ${result.error || 'Failed to fetch replies'}`);
      process.exit(1);
    }

    const isJson = cmdOpts.format === 'json';
    console.log(formatTweets(result.tweets ?? [], { json: isJson, emptyMessage: 'No replies found.' }));
  });

// ─── bookmarks ──────────────────────────────────────────────────

program
  .command('bookmarks')
  .description('Get your bookmarked tweets')
  .option('-n, --count <number>', 'Number of bookmarks', '20')
  .option('--all', 'Fetch all bookmarks')
  .option('--format <type>', 'Output format: json or text', 'text')
  .action(async (cmdOpts: any) => {
    const opts = program.opts();
    const client = await createClient(opts);
    const count = cmdOpts.all ? Infinity : parseInt(cmdOpts.count, 10);

    const result = await client.getBookmarksAll(count);
    if (!result.success) {
      console.error(`❌ ${result.error || 'Failed to fetch bookmarks'}`);
      process.exit(1);
    }

    const isJson = cmdOpts.format === 'json';
    console.log(formatTweets(result.tweets ?? [], { json: isJson, emptyMessage: 'No bookmarks found.' }));
  });

// ─── user-lookup ────────────────────────────────────────────────

program
  .command('user-lookup <handle>')
  .description('Look up user information')
  .option('--format <type>', 'Output format: json or text', 'text')
  .action(async (handle: string, cmdOpts: any) => {
    const opts = program.opts();
    const client = await createClient(opts);
    const username = normalizeUsername(handle);

    const result = await client.getUserByUsername(username);
    if (!result.success) {
      console.error(`❌ ${result.error || `User @${username} not found`}`);
      process.exit(1);
    }

    if (cmdOpts.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`👤 @${result.username} (${result.name})`);
      console.log(`🆔 User ID: ${result.userId}`);
    }
  });

// ─── query-ids ──────────────────────────────────────────────────

program
  .command('query-ids')
  .description('Show or refresh cached query IDs')
  .option('--refresh', 'Force refresh from x.com')
  .option('--format <type>', 'Output format: json or text', 'text')
  .action(async (cmdOpts: any) => {
    if (cmdOpts.refresh) {
      console.error('ℹ️  Refreshing query IDs from x.com JS bundles...');
      await refreshQueryIds({ force: true });
      console.error('✅ Done.');
    }

    const info = await getSnapshotInfo();
    if (!info) {
      console.error('⚠️  No cached query IDs. Run: x-reader query-ids --refresh');
      return;
    }

    if (cmdOpts.format === 'json') {
      console.log(JSON.stringify({
        cachePath: info.cachePath,
        fetchedAt: info.snapshot.fetchedAt,
        isFresh: info.isFresh,
        ageMs: info.ageMs,
        ids: info.snapshot.ids,
      }, null, 2));
    } else {
      console.log(`✅ Query IDs cached`);
      console.log(`📁 Path: ${info.cachePath}`);
      console.log(`📅 Fetched: ${info.snapshot.fetchedAt}`);
      console.log(`🟢 Fresh: ${info.isFresh ? 'yes' : 'no'}`);
      console.log(`📊 Operations: ${Object.keys(info.snapshot.ids).length}`);
      console.log('');
      for (const [op, qid] of Object.entries(info.snapshot.ids)) {
        console.log(`  ${op}: ${qid}`);
      }
    }
  });

// ─── setup ──────────────────────────────────────────────────────

program
  .command('setup')
  .description('Configure x-reader authentication')
  .action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> =>
      new Promise((resolve) => rl.question(q, resolve));

    console.log('🔧 x-reader setup');
    console.log('');
    console.log('You need two cookies from x.com:');
    console.log('1. Open x.com in your browser and log in');
    console.log('2. Open DevTools → Application → Cookies → x.com');
    console.log('3. Copy the values of auth_token and ct0');
    console.log('');

    const authToken = await ask('auth_token: ');
    const ct0 = await ask('ct0: ');
    rl.close();

    if (!authToken.trim() || !ct0.trim()) {
      console.error('❌ Both values are required.');
      process.exit(1);
    }

    const configDir = join(homedir(), '.config', 'x-reader');
    const configFile = join(configDir, 'config.json');

    await mkdir(configDir, { recursive: true });
    await writeFile(
      configFile,
      JSON.stringify({ auth_token: authToken.trim(), ct0: ct0.trim() }, null, 2) + '\n',
      'utf8',
    );

    console.log(`✅ Config saved to ${configFile}`);
    console.log('');
    console.log('Test it: x-reader search "hello"');
  });

// ─── Parse and run ──────────────────────────────────────────────

program.parse();
