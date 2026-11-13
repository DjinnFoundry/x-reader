import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/mock-x.mjs', import.meta.url));

function runPublishing(t, args, scenario = '') {
  const temporary = mkdtempSync(join(tmpdir(), 'x-reader-test-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const requestsPath = join(temporary, 'requests.jsonl');
  const cachePath = join(temporary, 'query-ids.json');
  writeFileSync(requestsPath, '');
  writeFileSync(cachePath, JSON.stringify({
    fetchedAt: new Date().toISOString(), ttlMs: 86400000,
    ids: { CreateTweet: 'test-query-id' }, discovery: { pages: [], bundles: [] },
  }));
  const image = join(temporary, 'image.png');
  writeFileSync(image, Buffer.from('89504e470d0a1a0a', 'hex'));
  const result = spawnSync(process.execPath, [
    '--import', fixture, cli, '--auth-token', 'test-token', '--ct0', 'test-csrf',
    ...args.map(arg => arg === '<image>' ? image : arg),
  ], {
    encoding: 'utf8', timeout: 10000,
    env: { ...process.env, X_READER_ENABLE_REPLY: '', XREADER_QUERY_IDS_CACHE: cachePath,
      MOCK_X_REQUESTS: requestsPath, MOCK_X_SCENARIO: scenario },
  });
  assert.ifError(result.error);
  const requests = readFileSync(requestsPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  return { ...result, requests };
}

describe('publishing through the CLI', () => {
  for (const command of ['post', 'tweet']) {
    it(`publishes a new tweet using ${command}`, t => {
      const result = runPublishing(t, [command, 'Hello world', '--format', 'json']);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        success: true, id: '987654321', url: 'https://x.com/testuser/status/987654321', text: 'Hello world',
      });
      assert.equal(result.requests.length, 1);
      assert.equal(result.requests[0].variables.tweet_text, 'Hello world');
      assert.equal(result.requests[0].variables.reply, undefined);
    });
  }

  it('publishes a reply by URL without an enable flag', t => {
    const result = runPublishing(t, ['reply', 'https://x.com/user/status/123456', 'A reply', '--format', 'json']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).success, true);
    assert.deepEqual(result.requests[0].variables.reply, { in_reply_to_tweet_id: '123456', exclude_reply_user_ids: [] });
  });

  it('shows the published URL in text output', t => {
    const result = runPublishing(t, ['post', 'Hello world']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /https:\/\/x.com\/testuser\/status\/987654321/);
  });

  for (const args of [['post', 'With images'], ['reply', '123456', 'With images']]) {
    it(`uploads and attaches images for ${args[0]}`, t => {
      const result = runPublishing(t, [...args, '--media', '<image>', '--media', '<image>', '--format', 'json']);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.requests.map(r => r.operation), ['upload', 'upload', 'CreateTweet']);
      assert.deepEqual(result.requests[2].variables.media.media_entities, [
        { media_id: '1', tagged_users: [] }, { media_id: '2', tagged_users: [] },
      ]);
    });

    it(`rejects more than four images before uploading for ${args[0]}`, t => {
      const media = Array.from({ length: 5 }, () => ['--media', '<image>']).flat();
      const result = runPublishing(t, [...args, ...media]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /At most 4 images/);
      assert.deepEqual(result.requests, []);
    });

    it(`stops after a failed upload for ${args[0]}`, t => {
      const result = runPublishing(t, [...args, '--media', '<image>'], 'upload-error');
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Media upload failed/);
      assert.deepEqual(result.requests.map(r => r.operation), ['upload']);
    });
  }

  for (const args of [['post', '   '], ['reply', '123456', '   ']]) {
    it(`rejects empty text without contacting X for ${args[0]}`, t => {
      const result = runPublishing(t, args);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Cannot post an empty tweet/);
      assert.deepEqual(result.requests, []);
    });
  }

  it('allows an image-only tweet', t => {
    const result = runPublishing(t, ['post', '', '--media', '<image>']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.requests.map(r => r.operation), ['upload', 'CreateTweet']);
  });

  it('rejects an invalid reply target before uploading', t => {
    const result = runPublishing(t, ['reply', 'invalid', 'A reply', '--media', '<image>']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid tweet/);
    assert.deepEqual(result.requests, []);
  });

  it('uses the fallback endpoint after a cached query ID returns 404', t => {
    const result = runPublishing(t, ['post', 'Hello world'], 'stale-id');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.requests.length, 2);
    assert.equal(result.requests[0].queryId, 'test-query-id');
    assert.notEqual(result.requests[1].queryId, 'test-query-id');
  });

  it('discovers authenticated client bundles when all publication IDs are stale', t => {
    const result = runPublishing(t, ['post', 'Hello world'], 'refresh-id');
    assert.equal(result.status, 0, result.stderr);
    const pages = result.requests.filter(r => r.operation === 'discovery-page');
    assert.ok(pages.length > 0);
    assert.ok(pages.every(r => r.authenticated));
    assert.equal(result.requests.at(-1).queryId, 'fresh-query-id');
    assert.equal(result.requests.filter(r => r.operation === 'CreateTweet').length, 3);
  });

  it('refreshes query IDs from the CLI using the selected account', t => {
    const result = runPublishing(t, ['query-ids', '--refresh', '--format', 'json']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ids.CreateTweet, 'fresh-query-id');
    assert.ok(result.requests.filter(r => r.operation === 'discovery-page').every(r => r.authenticated));
  });

  it('supplies the feature flags required by the current publication endpoint', t => {
    const result = runPublishing(t, ['post', 'Hello world'], 'required-features');
    assert.equal(result.status, 0, result.stderr);
  });

  for (const [scenario, error] of [
    ['http-error', /HTTP 401/], ['graphql-error', /Posting is not allowed/], ['missing-id', /no tweet id/],
  ]) {
    it(`reports ${scenario} once without retrying a write`, t => {
      const result = runPublishing(t, ['post', 'Hello world'], scenario);
      assert.equal(result.status, 1);
      assert.match(result.stderr, error);
      assert.equal(result.requests.length, 1);
    });
  }
});
