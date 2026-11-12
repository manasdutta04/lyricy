import type { FetchFn } from '../resolve/itunes';

/**
 * NetEase Cloud Music: a huge catalog (Hindi, English, Japanese, Korean, Chinese…)
 * with line-synced LRC, often including a romanized version.
 */
const BASE = 'https://music.163.com/api';

export interface NeteaseSong {
  id: number;
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
}

interface SearchResponse {
  result?: {
    songs?: {
      id: number;
      name: string;
      duration?: number;
      artists?: { name: string }[];
      album?: { name?: string };
    }[];
  };
}

interface LyricResponse {
  lrc?: { lyric?: string };
  romalrc?: { lyric?: string };
}

export async function neteaseSearch(
  query: string,
  fetchFn: FetchFn,
  limit = 8,
): Promise<NeteaseSong[]> {
  const params = new URLSearchParams({ s: query, type: '1', limit: String(limit) });
  const res = await fetchFn(`${BASE}/search/get?${params}`);
  if (!res.ok) throw new Error(`NetEase search failed: ${res.status}`);
  const body = (await res.json()) as SearchResponse;
  return (body.result?.songs ?? []).map((s) => ({
    id: s.id,
    title: s.name,
    artist: (s.artists ?? []).map((a) => a.name).join(', '),
    album: s.album?.name,
    durationSec: s.duration ? Math.round(s.duration / 1000) : undefined,
  }));
}

/** Credit lines NetEase puts at the top of LRC ("作词 : …", "Composer : …"). */
const CREDIT =
  /^\[[\d:.]+\]\s*(作词|作曲|编曲|制作人|制作|混音|母带|和声|吉他|贝斯|鼓|弦乐|录音|监制|出品|发行|词|曲|演唱|原唱|lyricist|lyrics by|composer|composed by|producer|produced by|arranger|arranged by|mixing|mastering|written by)\s*[:：]/i;

export function cleanNeteaseLrc(lrc: string): string {
  return lrc
    .split(/\r?\n/)
    .filter((line) => !CREDIT.test(line.trim()))
    .join('\n');
}

export async function neteaseLyrics(
  id: number,
  fetchFn: FetchFn,
): Promise<{ synced?: string; romanized?: string }> {
  const params = new URLSearchParams({ id: String(id), lv: '1', kv: '1', tv: '-1', rv: '-1' });
  const res = await fetchFn(`${BASE}/song/lyric?${params}`);
  if (!res.ok) throw new Error(`NetEase lyric failed: ${res.status}`);
  const body = (await res.json()) as LyricResponse;
  const synced = body.lrc?.lyric ? cleanNeteaseLrc(body.lrc.lyric) : undefined;
  const romanized = body.romalrc?.lyric ? cleanNeteaseLrc(body.romalrc.lyric) : undefined;
  return {
    synced: synced?.trim() ? synced : undefined,
    romanized: romanized?.trim() ? romanized : undefined,
  };
}
