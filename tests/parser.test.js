import { describe, it } from 'node:test';
import assert from 'assert';

describe('x-reader parser', () => {
  it('exposes expanded URL entities in parsed tweets', async () => {
    const { parseTweet } = await import('../dist/api/parser.js');
    const tweet = parseTweet({
      rest_id: '1234567890',
      legacy: {
        full_text: 'Read this https://t.co/abc',
        created_at: 'Sun Jul 05 21:00:00 +0000 2026',
        reply_count: 1,
        retweet_count: 2,
        favorite_count: 3,
        conversation_id_str: '1234567890',
        entities: {
          urls: [
            {
              url: 'https://t.co/abc',
              expanded_url: 'https://example.com/story?utm_source=x',
              display_url: 'example.com/story',
            },
          ],
        },
      },
      core: {
        user_results: {
          result: {
            rest_id: '42',
            legacy: {
              screen_name: 'example',
              name: 'Example',
            },
          },
        },
      },
    });

    assert.deepStrictEqual(tweet.urls, [
      {
        tco: 'https://t.co/abc',
        expanded: 'https://example.com/story?utm_source=x',
        display: 'example.com/story',
      },
    ]);
  });
});
