import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { readCookiesFromConfig, saveCookiesToConfig } from '../dist/utils/auth.js';

describe('x-reader authentication config', () => {
  it('saves credentials with restrictive permissions', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'x-reader-auth-'));
    const configFile = join(tempDir, 'nested', 'config.json');
    try {
      await saveCookiesToConfig('fake-auth-token', 'fake-csrf-token', configFile);

      const configDir = join(tempDir, 'nested');
      const saved = JSON.parse(await readFile(configFile, 'utf8'));
      assert.deepEqual(saved, {
        auth_token: 'fake-auth-token',
        ct0: 'fake-csrf-token',
      });
      assert.equal((await stat(configDir)).mode & 0o777, 0o700);
      assert.equal((await stat(configFile)).mode & 0o777, 0o600);

      await chmod(configFile, 0o644);
      await saveCookiesToConfig('replacement-auth', 'replacement-csrf', configFile);
      assert.deepEqual(JSON.parse(await readFile(configFile, 'utf8')), {
        auth_token: 'replacement-auth',
        ct0: 'replacement-csrf',
      });
      assert.equal((await stat(configFile)).mode & 0o777, 0o600);
      assert.deepEqual(await readdir(configDir), ['config.json']);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('repairs permissive modes on an existing config before reading it', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'x-reader-auth-upgrade-'));
    const configDir = join(tempDir, 'nested');
    const configFile = join(configDir, 'config.json');
    try {
      await mkdir(configDir, { mode: 0o755 });
      await writeFile(
        configFile,
        JSON.stringify({ auth_token: 'legacy-auth', ct0: 'legacy-csrf' }),
        { mode: 0o644 },
      );

      const cookies = await readCookiesFromConfig(configFile);

      assert.equal(cookies?.authToken, 'legacy-auth');
      assert.equal(cookies?.ct0, 'legacy-csrf');
      assert.equal((await stat(configDir)).mode & 0o777, 0o700);
      assert.equal((await stat(configFile)).mode & 0o777, 0o600);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});