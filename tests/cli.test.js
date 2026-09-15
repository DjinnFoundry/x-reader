import { describe, it } from 'node:test';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import assert from 'assert';

const CLI_PATH = fileURLToPath(new URL('../dist/cli/index.js', import.meta.url));

function execCli(args) {
  return execFileSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' });
}

describe('x-reader CLI', () => {
  it('should show version', () => {
    const output = execCli(['--version']).trim();
    assert.match(output, /^\d+\.\d+\.\d+$/);
  });

  it('should show help', () => {
    const output = execCli(['--help']);
    assert.ok(output.includes('search'));
    assert.ok(output.includes('user-tweets'));
    assert.ok(output.includes('bookmarks'));
    assert.ok(output.includes('replies'));
    assert.ok(output.includes('reply'));
    assert.ok(output.includes('post'));
    assert.ok(output.includes('read'));
    assert.ok(output.includes('user-lookup'));
    assert.ok(output.includes('query-ids'));
    assert.ok(output.includes('setup'));
  });

  it('should show reply help', () => {
    const output = execCli(['reply', '--help']);
    assert.ok(output.includes('tweet-id-or-url'));
    assert.ok(output.includes('text'));
    assert.ok(output.includes('--media'));
  });

  it('should show post help', () => {
    const output = execCli(['post', '--help']);
    assert.ok(output.includes('text'));
    assert.ok(output.includes('--media'));
    assert.ok(output.includes('--format'));
  });

  it('should show search help', () => {
    const output = execCli(['search', '--help']);
    assert.ok(output.includes('query'));
    assert.ok(output.includes('--count'));
    assert.ok(output.includes('--format'));
  });

  it('should show user-tweets help', () => {
    const output = execCli(['user-tweets', '--help']);
    assert.ok(output.includes('handle'));
    assert.ok(output.includes('--count'));
  });

  it('should show bookmarks help', () => {
    const output = execCli(['bookmarks', '--help']);
    assert.ok(output.includes('--count'));
    assert.ok(output.includes('--all'));
  });

  it('should show query-ids help', () => {
    const output = execCli(['query-ids', '--help']);
    assert.ok(output.includes('--refresh'));
  });

  it('should only allow post and reply as write commands (no like/retweet/follow)', () => {
    const output = execCli(['--help']);
    assert.ok(output.includes('  post '));
    assert.ok(output.includes('  reply '));
    assert.ok(!output.includes('  like '));
    assert.ok(!output.includes('  retweet '));
    assert.ok(!output.includes('  follow '));
    assert.ok(!output.includes('  unfollow '));
  });

  it('should keep reply disabled unless explicitly enabled', () => {
    const result = spawnSync(process.execPath, [CLI_PATH, 'reply', '1234567890', 'test'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        X_READER_ENABLE_WRITE: '',
        X_READER_ENABLE_REPLY: '',
      },
    });
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /Reply is disabled/);
  });

  it('should keep posts disabled unless explicitly enabled', () => {
    const result = spawnSync(process.execPath, [CLI_PATH, 'post', 'test'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        X_READER_ENABLE_WRITE: '',
        X_READER_ENABLE_POST: '',
      },
    });
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /Post is disabled/);
  });

  it('should reject mixed video and image attachments before upload', () => {
    const result = spawnSync(
      process.execPath,
      [
        CLI_PATH,
        '--auth-token',
        'fake-auth-token',
        '--ct0',
        'fake-csrf-token',
        'post',
        'Local validation only',
        '--media',
        'clip.mp4',
        '--media',
        'cover.png',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, X_READER_ENABLE_POST: 'true' },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /A video cannot be combined with other media/);
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
