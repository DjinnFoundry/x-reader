/**
 * Auto-discovery of Twitter/X GraphQL query IDs.
 *
 * X periodically rotates the query IDs embedded in their JS bundles.
 * This module scrapes x.com pages to find the current bundle URLs,
 * then parses those bundles to extract queryId ↔ operationName mappings.
 *
 * Falls back to hardcoded defaults if discovery fails.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join, dirname, resolve } from 'path';
import {
  DEFAULT_QUERY_IDS,
  DISCOVERY_PAGES,
  BUNDLE_URL_REGEX,
  QUERY_ID_PATTERNS,
  QUERY_ID_TTL_MS,
  DISCOVERY_OPERATIONS,
} from './constants.js';
import type { QueryIdCache } from './types.js';

const VALID_QUERY_ID = /^[a-zA-Z0-9_-]+$/;

const FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ─── Cache file path ─────────────────────────────────────────────

function getCachePath(): string {
  const envPath = process.env.XREADER_QUERY_IDS_CACHE;
  if (envPath?.trim()) return resolve(envPath.trim());
  return join(homedir(), '.config', 'x-reader', 'query-ids-cache.json');
}

// ─── Load / Save cache ──────────────────────────────────────────

function parseCache(raw: unknown): QueryIdCache | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const fetchedAt = typeof obj.fetchedAt === 'string' ? obj.fetchedAt : null;
  const ttlMs = typeof obj.ttlMs === 'number' && Number.isFinite(obj.ttlMs) ? obj.ttlMs : null;
  const ids = obj.ids && typeof obj.ids === 'object' ? (obj.ids as Record<string, unknown>) : null;
  const disc = obj.discovery && typeof obj.discovery === 'object'
    ? (obj.discovery as Record<string, unknown>)
    : null;

  if (!fetchedAt || !ttlMs || !ids || !disc) return null;

  const pages = Array.isArray(disc.pages) ? disc.pages.filter((p): p is string => typeof p === 'string') : null;
  const bundles = Array.isArray(disc.bundles) ? disc.bundles.filter((b): b is string => typeof b === 'string') : null;
  if (!pages || !bundles) return null;

  const cleanIds: Record<string, string> = {};
  for (const [k, v] of Object.entries(ids)) {
    if (typeof v === 'string' && v.trim()) cleanIds[k] = v.trim();
  }

  return { fetchedAt, ttlMs, ids: cleanIds, discovery: { pages, bundles } };
}

async function loadCache(path: string): Promise<QueryIdCache | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return parseCache(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function saveCache(path: string, cache: QueryIdCache): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}

// ─── Bundle discovery ───────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  const resp = await fetch(url, { headers: FETCH_HEADERS });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} for ${url}: ${body.slice(0, 120)}`);
  }
  return resp.text();
}

async function discoverBundleUrls(): Promise<string[]> {
  const found = new Set<string>();
  for (const page of DISCOVERY_PAGES) {
    try {
      const html = await fetchText(page);
      for (const match of html.matchAll(BUNDLE_URL_REGEX)) {
        found.add(match[0]);
      }
    } catch {
      // Some pages may fail — that's OK
    }
  }
  const urls = [...found];
  if (urls.length === 0) {
    throw new Error('No client bundles discovered; x.com layout may have changed.');
  }
  return urls;
}

function extractFromBundle(
  js: string,
  bundleName: string,
  wantedOps: Set<string>,
  results: Map<string, { queryId: string; bundle: string }>,
): void {
  for (const pattern of QUERY_ID_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(js)) !== null) {
      const op = match[pattern.operationGroup];
      const qid = match[pattern.queryIdGroup];
      if (!op || !qid || !wantedOps.has(op) || !VALID_QUERY_ID.test(qid)) continue;
      if (results.has(op)) continue;
      results.set(op, { queryId: qid, bundle: bundleName });
      if (results.size === wantedOps.size) return;
    }
  }
}

async function scanBundles(
  urls: string[],
  wantedOps: Set<string>,
): Promise<Map<string, { queryId: string; bundle: string }>> {
  const results = new Map<string, { queryId: string; bundle: string }>();
  const BATCH = 6;
  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (url) => {
        if (results.size === wantedOps.size) return;
        const name = url.split('/').at(-1) ?? url;
        try {
          const js = await fetchText(url);
          extractFromBundle(js, name, wantedOps, results);
        } catch {
          // Individual bundle failures are OK
        }
      }),
    );
    if (results.size === wantedOps.size) break;
  }
  return results;
}

// ─── Public API ─────────────────────────────────────────────────

let memoryCache: QueryIdCache | null = null;

export interface SnapshotInfo {
  snapshot: QueryIdCache;
  cachePath: string;
  ageMs: number;
  isFresh: boolean;
}

export async function getSnapshotInfo(): Promise<SnapshotInfo | null> {
  const cachePath = getCachePath();
  if (!memoryCache) {
    memoryCache = await loadCache(cachePath);
  }
  if (!memoryCache) return null;

  const age = Date.now() - new Date(memoryCache.fetchedAt).getTime();
  return {
    snapshot: memoryCache,
    cachePath,
    ageMs: Number.isFinite(age) ? Math.max(0, age) : Infinity,
    isFresh: age <= (memoryCache.ttlMs || QUERY_ID_TTL_MS),
  };
}

/**
 * Get a single query ID by operation name.
 * Returns cached value, or falls back to hardcoded default.
 */
export async function getQueryId(operation: string): Promise<string> {
  const info = await getSnapshotInfo();
  if (info?.snapshot.ids[operation]) {
    return info.snapshot.ids[operation];
  }
  return DEFAULT_QUERY_IDS[operation] ?? '';
}

/**
 * Refresh query IDs by scraping x.com JS bundles.
 * Saves results to disk cache.
 */
export async function refreshQueryIds(
  options: { force?: boolean } = {},
): Promise<SnapshotInfo | null> {
  const cachePath = getCachePath();

  // Check if cache is still fresh
  if (!options.force) {
    const existing = await getSnapshotInfo();
    if (existing?.isFresh) return existing;
  }

  const wantedOps = new Set(DISCOVERY_OPERATIONS);
  const bundleUrls = await discoverBundleUrls();
  const found = await scanBundles(bundleUrls, wantedOps);

  if (found.size === 0) {
    // Discovery failed — return existing cache if any
    return getSnapshotInfo();
  }

  const ids: Record<string, string> = {};
  for (const op of DISCOVERY_OPERATIONS) {
    const entry = found.get(op);
    if (entry?.queryId) ids[op] = entry.queryId;
  }

  const cache: QueryIdCache = {
    fetchedAt: new Date().toISOString(),
    ttlMs: QUERY_ID_TTL_MS,
    ids,
    discovery: {
      pages: [...DISCOVERY_PAGES],
      bundles: bundleUrls.map((u) => u.split('/').at(-1) ?? u),
    },
  };

  await saveCache(cachePath, cache);
  memoryCache = cache;
  return getSnapshotInfo();
}

/** Clear in-memory cache (for testing) */
export function clearMemory(): void {
  memoryCache = null;
}
