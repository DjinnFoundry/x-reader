import { describe, it } from 'node:test';
import { execSync } from 'child_process';
import assert from 'assert';

describe('x-reader CLI', () => {
  it('should show version', () => {
    const output = execSync('x-reader --version', { encoding: 'utf8' }).trim();
    assert.match(output, /^\d+\.\d+\.\d+$/);
  });

  it('should show help', () => {
    const output = execSync('x-reader --help', { encoding: 'utf8' });
    assert.ok(output.includes('search'));
    assert.ok(output.includes('user-tweets'));
    assert.ok(output.includes('bookmarks'));
    assert.ok(output.includes('replies'));
    assert.ok(output.includes('read'));
    assert.ok(output.includes('user-lookup'));
    assert.ok(output.includes('query-ids'));
    assert.ok(output.includes('setup'));
  });

  it('should show search help', () => {
    const output = execSync('x-reader search --help', { encoding: 'utf8' });
    assert.ok(output.includes('query'));
    assert.ok(output.includes('--count'));
    assert.ok(output.includes('--format'));
  });

  it('should show user-tweets help', () => {
    const output = execSync('x-reader user-tweets --help', { encoding: 'utf8' });
    assert.ok(output.includes('handle'));
    assert.ok(output.includes('--count'));
  });

  it('should show bookmarks help', () => {
    const output = execSync('x-reader bookmarks --help', { encoding: 'utf8' });
    assert.ok(output.includes('--count'));
    assert.ok(output.includes('--all'));
  });

  it('should show query-ids help', () => {
    const output = execSync('x-reader query-ids --help', { encoding: 'utf8' });
    assert.ok(output.includes('--refresh'));
  });

  it('should NOT have write commands (tweet, like, retweet, follow)', () => {
    const output = execSync('x-reader --help', { encoding: 'utf8' });
    // These should NOT be present — read-only tool
    assert.ok(!output.includes('  tweet '));
    assert.ok(!output.includes('  like '));
    assert.ok(!output.includes('  retweet '));
    assert.ok(!output.includes('  follow '));
    assert.ok(!output.includes('  unfollow '));
  });
});

describe('x-reader format utilities', () => {
  it('should extract tweet ID from URL', async () => {
    const { extractTweetId } = await import('../dist/utils/format.js');
    assert.strictEqual(extractTweetId('https://x.com/user/status/123456'), '123456');
    assert.strictEqual(extractTweetId('https://twitter.com/user/status/789'), '789');
    assert.strictEqual(extractTweetId('987654321'), '987654321');
  });

  it('should throw on invalid tweet ID', async () => {
    const { extractTweetId } = await import('../dist/utils/format.js');
    assert.throws(() => extractTweetId('not-a-tweet'));
  });
});
