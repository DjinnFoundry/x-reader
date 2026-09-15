import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { XReaderClient } from '../dist/api/client.js';

const originalFetch = globalThis.fetch;
let requests;

function successResponse(text) {
  return new Response(
    JSON.stringify({
      data: {
        create_tweet: {
          tweet_results: {
            result: {
              rest_id: '1234567890',
              core: {
                user_results: {
                  result: { legacy: { screen_name: 'zetaread_test' } },
                },
              },
              legacy: { full_text: text },
            },
          },
        },
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

beforeEach(() => {
  requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    const body = JSON.parse(String(init?.body));
    return successResponse(body.variables.tweet_text);
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createClient(enableWrites = false) {
  return new XReaderClient({
    cookies: { authToken: 'test-auth-token', ct0: 'test-csrf-token' },
    enableWrites,
  });
}

describe('x-reader write mutation contract', () => {
  it('rejects write methods unless the client explicitly enables them', async () => {
    await assert.rejects(
      createClient().createTweet('This must stay local'),
      /Write operations are disabled/,
    );
    await assert.rejects(
      createClient().reply('1234567890', 'This must stay local'),
      /Write operations are disabled/,
    );
    await assert.rejects(
      createClient().uploadMedia('/not-present/video.mp4'),
      /Write operations are disabled/,
    );
    assert.equal(requests.length, 0);
  });

  it('never retries a mutation after an ambiguous HTTP failure', async () => {
    const client = createClient(true);
    client.getQueryIds = async () => ['first-query-id', 'second-query-id'];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response('Upstream unavailable', { status: 503 });
    };

    const result = await client.createTweet('Send exactly once');

    assert.equal(result.success, false);
    assert.match(result.error, /HTTP 503/);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /first-query-id/);
  });

  it('creates an original post without a reply block', async () => {
    const result = await createClient(true).createTweet('Original post', {
      mediaIds: ['media-1'],
    });

    assert.equal(result.success, true);
    assert.equal(result.url, 'https://x.com/zetaread_test/status/1234567890');
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /\/CreateTweet$/);

    const body = JSON.parse(String(requests[0].init.body));
    assert.equal(body.variables.tweet_text, 'Original post');
    assert.equal('reply' in body.variables, false);
    assert.deepEqual(body.variables.media.media_entities, [
      { media_id: 'media-1', tagged_users: [] },
    ]);
  });

  it('creates a reply with the target tweet id', async () => {
    const result = await createClient(true).reply('9988776655', 'Reply text');

    assert.equal(result.success, true);
    assert.equal(requests.length, 1);
    const body = JSON.parse(String(requests[0].init.body));
    assert.deepEqual(body.variables.reply, {
      in_reply_to_tweet_id: '9988776655',
      exclude_reply_user_ids: [],
    });
  });
});
