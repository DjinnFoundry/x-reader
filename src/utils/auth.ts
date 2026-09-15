/**
 * Authentication utilities — resolve cookies from Chrome, env, or config file.
 */

import { chmod, mkdir, open, readFile, rename, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import type { Cookies } from '../api/types.js';

const CONFIG_DIR = join(homedir(), '.config', 'x-reader');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface ResolvedCookies {
  cookies: Cookies;
  warnings: string[];
}

/** Save only the two required cookies with restrictive filesystem permissions. */
export async function saveCookiesToConfig(
  authToken: string,
  ct0: string,
  configFile = CONFIG_FILE,
): Promise<string> {
  const configDir = dirname(configFile);
  const tempFile = `${configFile}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  await chmod(configDir, 0o700);

  try {
    const handle = await open(tempFile, 'wx', 0o600);
    try {
      await handle.writeFile(
        JSON.stringify({ auth_token: authToken, ct0 }, null, 2) + '\n',
        'utf8',
      );
      await handle.sync();
    } finally {
      await handle.close();
    }

    await rename(tempFile, configFile);
    await chmod(configFile, 0o600);
    return configFile;
  } catch (error) {
    await rm(tempFile, { force: true });
    throw error;
  }
}

/**
 * Try to get cookies from Chrome's cookie store on macOS.
 * This uses `security` CLI to access the keychain and `sqlite3` to read the cookie DB.
 */
async function getCookiesFromChrome(): Promise<Cookies | null> {
  if (process.platform !== 'darwin') return null;

  try {
    // Chrome cookie DB path on macOS
    const cookieDb = join(
      homedir(),
      'Library/Application Support/Google/Chrome/Default/Cookies',
    );
    if (!existsSync(cookieDb)) return null;

    // Note: Chrome encrypts cookies on macOS. We'd need the encryption key from Keychain.
    // For now, this is a placeholder — users should use env vars or config file.
    // TODO: Implement Chrome cookie decryption if needed.
    return null;
  } catch {
    return null;
  }
}

/**
 * Read cookies from config file (~/.config/x-reader/config.json).
 */
export async function readCookiesFromConfig(configFile = CONFIG_FILE): Promise<Cookies | null> {
  if (!existsSync(configFile)) return null;
  try {
    await chmod(dirname(configFile), 0o700);
    await chmod(configFile, 0o600);
    const raw = await readFile(configFile, 'utf8');
    const config = JSON.parse(raw);
    if (config.auth_token && config.ct0) {
      return {
        authToken: config.auth_token,
        ct0: config.ct0,
        source: 'config file',
      };
    }
    return null;
  } catch {
    console.error(`⚠️  Config file is corrupted or inaccessible: ${configFile}`);
    console.error(`   Run \`x-reader setup\` to recreate it.`);
    return null;
  }
}

/**
 * Read cookies from Bird CLI's config (for seamless migration).
 */
async function getCookiesFromBirdConfig(): Promise<Cookies | null> {
  const birdConfig = join(homedir(), '.config', 'bird', 'config.json');
  if (!existsSync(birdConfig)) return null;
  try {
    const raw = await readFile(birdConfig, 'utf8');
    const config = JSON.parse(raw);
    if (config.auth_token && config.ct0) {
      return {
        authToken: config.auth_token,
        ct0: config.ct0,
        source: 'bird config',
      };
    }
    return null;
  } catch {
    console.error(`⚠️  Bird CLI config is corrupted: ${birdConfig}`);
    return null;
  }
}

/**
 * Read cookies from environment variables.
 */
function getCookiesFromEnv(): Cookies | null {
  const authToken = process.env.AUTH_TOKEN || process.env.TWITTER_AUTH_TOKEN;
  const ct0 = process.env.CT0 || process.env.TWITTER_CT0;
  if (authToken && ct0) {
    return { authToken, ct0, source: 'environment variables' };
  }
  return null;
}

/**
 * Resolve cookies from all sources. Priority:
 * 1. CLI flags (--auth-token, --ct0)
 * 2. Environment variables (AUTH_TOKEN, CT0)
 * 3. x-reader config file
 * 4. Bird CLI config file (migration)
 * 5. Chrome cookies (macOS only)
 */
export async function resolveCookies(
  flags: { authToken?: string; ct0?: string } = {},
): Promise<ResolvedCookies> {
  const warnings: string[] = [];

  // 1. CLI flags
  if (flags.authToken && flags.ct0) {
    return {
      cookies: { authToken: flags.authToken, ct0: flags.ct0, source: 'CLI flags' },
      warnings,
    };
  }

  // 2. Environment
  const envCookies = getCookiesFromEnv();
  if (envCookies) return { cookies: envCookies, warnings };

  // 3. x-reader config
  const configCookies = await readCookiesFromConfig();
  if (configCookies) return { cookies: configCookies, warnings };

  // 4. Bird config (migration)
  const birdCookies = await getCookiesFromBirdConfig();
  if (birdCookies) {
    warnings.push('Using Bird CLI config. Run `x-reader setup` to create x-reader config.');
    return { cookies: birdCookies, warnings };
  }

  // 5. Chrome (placeholder)
  const chromeCookies = await getCookiesFromChrome();
  if (chromeCookies) return { cookies: chromeCookies, warnings };

  // Nothing found
  return {
    cookies: { authToken: '', ct0: '', source: '' },
    warnings: ['No credentials found. Set AUTH_TOKEN and CT0 env vars, or run `x-reader setup`.'],
  };
}
