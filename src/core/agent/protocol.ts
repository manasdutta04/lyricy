/**
 * Messages between the page agent (content script in the music tab) and the side
 * panel. The agent never touches the page's UI: it only reports what is playing
 * and where playback is, and seeks when asked.
 */

export const AGENT_PORT = 'lyricy-agent';

/** Events between the isolated agent and the page-world hooks (same tab). */
export const PAGE_SNAPSHOT_REQUEST = 'lyricy:snapshot-request';
export const PAGE_SNAPSHOT = 'lyricy:snapshot';
export const PAGE_SEEK = 'lyricy:seek';
/** Ask the page hooks for captions YouTube's player has loaded (detail: video id). */
export const PAGE_CAPTIONS_REQUEST = 'lyricy:captions-request';
export const PAGE_CAPTIONS = 'lyricy:captions';
/** Ask the page hooks to have the player load captions (briefly turns CC on). */
export const PAGE_CAPTIONS_LOAD = 'lyricy:captions-load';

/** Caption files the player downloaded, as raw json3, per kind. */
export interface CapturedCaptions {
  manual?: { language: string; json: unknown };
  asr?: { language: string; json: unknown };
}

export type SiteKind = 'youtube' | 'ytmusic' | 'other';

export interface CaptionTrackInfo {
  baseUrl: string;
  languageCode: string;
  /** 'asr' for auto-generated captions. */
  kind?: string;
  name?: string;
}

export interface YouTubeInfo {
  videoId: string;
  title: string;
  author: string;
  lengthSec: number;
  category?: string;
  isLive?: boolean;
  isShorts?: boolean;
  /** "Music in this video" card (read from the page). */
  music?: { title: string; artist: string; album?: string };
  captionTracks?: CaptionTrackInfo[];
  /** This "track" is one chapter (song) of a jukebox/medley video. */
  isChapter?: boolean;
  /** Where this chapter starts in the video. */
  chapterStartSec?: number;
  /** Songs inside a jukebox/medley video (from the description or YouTube chapters). */
  chapters?: { title: string; startSec: number }[];
}

export interface TrackSnapshot {
  /** Stable identity: YouTube video id, or host|artist|title from MediaSession. */
  key: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  durationSec?: number;
  youtube?: YouTubeInfo;
}

export interface PlaybackSnapshot {
  positionMs: number;
  playing: boolean;
  rate: number;
  /** An ad is playing (position is the ad's, not the song's). */
  ad: boolean;
  /** Date.now() when positionMs was read, so the panel can extrapolate precisely. */
  at: number;
}

export interface PageSnapshot {
  site: SiteKind;
  host: string;
  track: TrackSnapshot | null;
  playback: PlaybackSnapshot | null;
}

/** Caption data the agent fetched for a YouTube video (used for fallback and auto-sync). */
export interface CaptionCue {
  start: number;
  end: number;
  text: string;
  /** Per-word timing (auto-generated captions carry a timestamp for every word). */
  words?: { text: string; start: number; end: number }[];
}

export interface CaptionWord {
  start: number;
  text: string;
}

export interface CaptionData {
  /** Uploader-provided captions (often the lyrics on official music videos). */
  manual?: { language: string; cues: CaptionCue[] };
  /** Auto-generated speech recognition, word-timed. */
  asr?: { language: string; words: CaptionWord[]; cues?: CaptionCue[] };
}

export type AgentMessage =
  | { type: 'snapshot'; snapshot: PageSnapshot }
  | { type: 'captions'; key: string; captions: CaptionData | null };

export type PanelMessage =
  | { type: 'seek'; seconds: number }
  /** Captions for the current video; with load: true, have the player fetch them first. */
  | { type: 'captions'; key: string; load?: boolean };
