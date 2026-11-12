import type { CaptionData } from '../agent/protocol';
import type { Script } from '../lang/script';

export type SyncKind = 'word' | 'line' | 'none';

export interface Word {
  text: string;
  /** ms */
  start: number;
  /** ms */
  end: number;
}

export interface LyricLine {
  /** ms; 0 for unsynced lyrics */
  start: number;
  /** ms; 0 for unsynced lyrics */
  end: number;
  text: string;
  words?: Word[];
  /** Latin-letter version of `text` (Hinglish, romaji…) when `text` isn't Latin. */
  romanized?: string;
}

export type LyricsSource = 'lrclib' | 'netease' | 'lyrics.ovh' | 'youtube-captions';

export const SOURCE_LABELS: Record<LyricsSource, string> = {
  lrclib: 'LRCLIB',
  netease: 'NetEase Cloud Music',
  'lyrics.ovh': 'lyrics.ovh',
  'youtube-captions': 'YouTube captions',
};

export interface Lyrics {
  sync: SyncKind;
  lines: LyricLine[];
  source: LyricsSource;
  sourceId?: string | number;
  /** Script of `lines[].text`. */
  script?: Script;
  /**
   * Where `romanized` came from: another upload of the same lyrics ('provider'),
   * our transliterator ('generated'), or not available ('none', e.g. Japanese kanji).
   */
  romanization?: 'provider' | 'generated' | 'none';
  /** Timed by aligning plain lyrics to YouTube's auto-captions. */
  autoSynced?: boolean;
  /** Shift applied so studio-timed lyrics match this video (e.g. a music-video intro). */
  offsetMs?: number;
}

/** Canonical song metadata (from iTunes or the lyric provider). */
export interface TrackInfo {
  artist: string;
  title: string;
  album?: string;
  durationSec?: number;
  artworkUrl?: string;
}

/** What we know about what is playing (a YouTube video or a MediaSession track). */
export interface VideoDetails {
  /** Cache key: YouTube video id, or host|artist|title. */
  videoId: string;
  title: string;
  author: string;
  lengthSec: number;
  category?: string;
  isLive?: boolean;
  site?: 'youtube' | 'ytmusic' | 'other';
  /**
   * The song as YouTube itself identified it: the "Music in this video" card on
   * YouTube, or the track metadata on YouTube Music. The most reliable signal.
   */
  music?: { title: string; artist: string; album?: string };
  /** YouTube captions, for fallback lyrics and auto-sync. */
  captions?: CaptionData | null;
}

export type LyricsResult =
  | { status: 'found'; track: TrackInfo; lyrics: Lyrics; confidence: number }
  | { status: 'instrumental'; track: TrackInfo }
  | { status: 'not-found'; query: { artist: string; title: string } }
  | { status: 'error'; message: string };
