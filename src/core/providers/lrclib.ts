import type { FetchFn } from '../resolve/itunes';

const BASE = 'https://lrclib.net/api';
// Browsers can't set User-Agent; LRCLIB accepts this header for identifying clients.
const HEADERS = { 'Lrclib-Client': 'Lyricy/0.1 (browser extension)' };

export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string | null;
  /** seconds */
  duration?: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/** Exact lookup (LRCLIB matches duration within ±2 s). Returns null on 404. */
export async function lrclibGet(
  q: { artist: string; title: string; album?: string; durationSec: number },
  fetchFn: FetchFn,
): Promise<LrclibRecord | null> {
  const params = new URLSearchParams({
    artist_name: q.artist,
    track_name: q.title,
    duration: String(Math.round(q.durationSec)),
  });
  if (q.album) params.set('album_name', q.album);
  const res = await fetchFn(`${BASE}/get?${params}`, { headers: HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB get failed: ${res.status}`);
  return (await res.json()) as LrclibRecord;
}

export async function lrclibSearch(
  q: { q: string } | { title: string; artist?: string },
  fetchFn: FetchFn,
): Promise<LrclibRecord[]> {
  const params = new URLSearchParams();
  if ('q' in q) params.set('q', q.q);
  else {
    params.set('track_name', q.title);
    if (q.artist) params.set('artist_name', q.artist);
  }
  const res = await fetchFn(`${BASE}/search?${params}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`LRCLIB search failed: ${res.status}`);
  return (await res.json()) as LrclibRecord[];
}
