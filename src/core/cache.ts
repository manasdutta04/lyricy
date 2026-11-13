import { storage } from '#imports';
import type { LyricsResult } from './lyrics/types';

/** Bump when matching logic changes so stale picks get re-resolved. */
const CACHE_VERSION = 6;
const DAY = 24 * 60 * 60 * 1000;
const TTL: Record<LyricsResult['status'], number> = {
  found: 30 * DAY,
  instrumental: 30 * DAY,
  'not-found': DAY,
  error: 0,
};

interface CacheEntry {
  savedAt: number;
  result: LyricsResult;
}

const key = (videoId: string) => `local:lyrics:v${CACHE_VERSION}:${videoId}` as const;

export async function getCached(videoId: string): Promise<LyricsResult | null> {
  const entry = await storage.getItem<CacheEntry>(key(videoId));
  if (!entry) return null;
  if (Date.now() - entry.savedAt > TTL[entry.result.status]) {
    await storage.removeItem(key(videoId));
    return null;
  }
  return entry.result;
}

/** Deletes entries written by older cache versions (run on install/update). */
export async function pruneOldVersions(): Promise<void> {
  const all = await browser.storage.local.get(null);
  const current = `lyrics:v${CACHE_VERSION}:`;
  const stale = Object.keys(all).filter((k) => k.startsWith('lyrics:v') && !k.startsWith(current));
  if (stale.length) await browser.storage.local.remove(stale);
}

export async function setCached(videoId: string, result: LyricsResult): Promise<void> {
  if (TTL[result.status] === 0) return;
  await storage.setItem<CacheEntry>(key(videoId), { savedAt: Date.now(), result });
}
