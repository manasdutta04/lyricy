import type { FetchFn } from '../resolve/itunes';

/**
 * JioSaavn: India's largest catalog. Lyrics are plain text (often already Hinglish),
 * so they're a fallback when no synced source has the song.
 */
const BASE = 'https://www.jiosaavn.com/api.php';
const COMMON = { _format: 'json', _marker: '0', api_version: '4', ctx: 'web6dot0' };

export interface JiosaavnSong {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
}

interface SearchResponse {
  results?: {
    id: string;
    title?: string;
    more_info?: {
      has_lyrics?: string | boolean;
      duration?: string;
      album?: string;
      artistMap?: { primary_artists?: { name: string }[] };
    };
  }[];
}

/** JioSaavn returns HTML entities in titles ("From &quot;Ramayana&quot;"). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/** Songs that have lyrics on JioSaavn. */
export async function jiosaavnSearch(query: string, fetchFn: FetchFn): Promise<JiosaavnSong[]> {
  const params = new URLSearchParams({
    ...COMMON,
    __call: 'search.getResults',
    q: query,
    n: '10',
    p: '1',
  });
  const res = await fetchFn(`${BASE}?${params}`);
  if (!res.ok) throw new Error(`JioSaavn search failed: ${res.status}`);
  const body = (await res.json()) as SearchResponse;
  return (body.results ?? [])
    .filter((r) => String(r.more_info?.has_lyrics) === 'true')
    .map((r) => ({
      id: r.id,
      title: decodeEntities(r.title ?? ''),
      artist: decodeEntities(
        (r.more_info?.artistMap?.primary_artists ?? []).map((a) => a.name).join(', '),
      ),
      album: r.more_info?.album ? decodeEntities(r.more_info.album) : undefined,
      durationSec: Number(r.more_info?.duration) || undefined,
    }));
}

export async function jiosaavnLyrics(id: string, fetchFn: FetchFn): Promise<string | null> {
  const params = new URLSearchParams({ ...COMMON, __call: 'lyrics.getLyrics', lyrics_id: id });
  const res = await fetchFn(`${BASE}?${params}`);
  if (!res.ok) throw new Error(`JioSaavn lyrics failed: ${res.status}`);
  const body = (await res.json()) as { lyrics?: string };
  if (!body.lyrics) return null;
  const text = decodeEntities(body.lyrics.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
  return text.trim() || null;
}
