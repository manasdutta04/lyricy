import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { sliceCaptions } from '@/core/agent/captions';
import type { CaptionData, TrackSnapshot } from '@/core/agent/protocol';
import type { LyricsResult, TrackInfo, VideoDetails } from '@/core/lyrics/types';
import { requestLyrics } from '@/core/messages';

/**
 * Every video is searched automatically. Only these categories may use the
 * video's own captions as lyrics, so a lecture's subtitles never show up as
 * "lyrics" (songs from films are often filed under Film & Animation).
 */
const CAPTION_CATEGORIES = new Set(['Music', 'Entertainment', 'Film & Animation']);

/** Whether this video's captions can stand in for lyrics. */
export function captionsAllowed(yt: TrackSnapshot['youtube']): boolean {
  if (!yt) return false;
  return Boolean(yt.music) || !yt.category || CAPTION_CATEGORIES.has(yt.category);
}

export type LyricsState =
  | { phase: 'idle' }
  | { phase: 'loading'; track: TrackSnapshot }
  | { phase: 'done'; track: TrackSnapshot; result: LyricsResult; deep?: boolean };

export function trackOf(state: LyricsState): TrackInfo | undefined {
  if (state.phase !== 'done') return undefined;
  const { result } = state;
  return result.status === 'found' || result.status === 'instrumental' ? result.track : undefined;
}

/** What the lyrics pipeline needs to know about the playing track. */
export function toVideoDetails(
  track: TrackSnapshot,
  site: 'youtube' | 'ytmusic' | 'other',
  captions: CaptionData | null,
): VideoDetails {
  const yt = track.youtube;
  if (yt && site === 'youtube') {
    return {
      // The track key, not the bare video id: each song in a jukebox is its own
      // track ("<id>#<chapter>") and must get its own cached lyrics.
      videoId: track.key,
      title: yt.title,
      author: yt.author,
      lengthSec: yt.lengthSec,
      category: yt.category,
      isLive: yt.isLive,
      site,
      music: yt.music,
      captions,
      // The description's lyrics are for the whole video, not one jukebox song.
      descriptionLyrics: yt.isChapter ? undefined : yt.descriptionLyrics,
    };
  }
  // YouTube Music and MediaSession sites report clean song metadata.
  return {
    videoId: track.key,
    title: track.title,
    author: track.artist,
    lengthSec: track.durationSec ?? 0,
    site,
    music: { title: track.title, artist: track.artist, album: track.album },
    captions,
  };
}

/** No lyrics, or lyrics that can't be synced to this video: YouTube captions may help. */
export function needsCaptions(result: LyricsResult): boolean {
  if (result.status === 'not-found') return true;
  if (result.status !== 'found') return false;
  return result.lyrics.sync === 'none' || Boolean(result.lyrics.videoMismatch);
}

/** Prefer synced over unsynced, and any lyrics over none. */
export function isBetter(next: LyricsResult, prev: LyricsResult): boolean {
  const rank = (r: LyricsResult) =>
    r.status !== 'found' ? 0 : r.lyrics.sync === 'none' || r.lyrics.videoMismatch ? 1 : 2;
  return rank(next) > rank(prev);
}

/** One lyrics lookup per track, re-run on retry or "Find it anyway". */
export function useLyrics(
  track: TrackSnapshot | null,
  site: 'youtube' | 'ytmusic' | 'other',
  fetchCaptions: (key: string, load?: boolean) => Promise<CaptionData | null>,
) {
  const [state, setState] = useState<LyricsState>({ phase: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const forceRef = useRef(false);
  /** Set by "Find it anyway" for the next lookup of this track. */
  const deepRef = useRef<string | null>(null);
  const manualRef = useRef<{ key: string; title: string; artist: string } | null>(null);
  /** Videos we already asked YouTube to load captions for (don't flash CC twice). */
  const triedCaptionsRef = useRef(new Set<string>());
  const trackRef = useRef(track);
  trackRef.current = track;
  const key = track?.key ?? null;

  useEffect(() => {
    const current = trackRef.current;
    if (!key || !current) {
      setState({ phase: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ phase: 'loading', track: current });

    (async () => {
      const yt = current.youtube;
      const deep = deepRef.current === key;
      deepRef.current = null;
      // Asked for explicitly: any video's captions may stand in for lyrics.
      const useCaptions = site !== 'other' && (deep || captionsAllowed(yt));
      const getCaptions = async (load: boolean) => {
        const captions = useCaptions ? await fetchCaptions(key, load) : null;
        // In a jukebox, keep only this song's part of the captions, timed from its start.
        if (captions && yt?.isChapter && yt.chapterStartSec !== undefined) {
          return sliceCaptions(
            captions,
            yt.chapterStartSec * 1000,
            (yt.chapterStartSec + yt.lengthSec) * 1000,
          );
        }
        return captions;
      };

      const manual = manualRef.current?.key === key ? manualRef.current : null;
      const force = forceRef.current || Boolean(manual) || deep;
      forceRef.current = false;
      manualRef.current = null;
      const lookup = (captions: CaptionData | null, forceLookup: boolean) => {
        const details = toVideoDetails(current, site, captions);
        // A manual search replaces the song identity but keeps the video's timing data.
        const request = manual
          ? {
              ...details,
              title: manual.title,
              author: manual.artist,
              // A YouTube video's length may include an intro; don't hold it against matches.
              lengthSec: site === 'youtube' ? 0 : details.lengthSec,
              site: 'other' as const,
              music: { title: manual.title, artist: manual.artist },
            }
          : details;
        return requestLyrics(deep ? { ...request, deep: true } : request, forceLookup);
      };

      // 1. Lyrics sources first (plus any captions the player already has).
      //    "Find it anyway" has YouTube load its captions straight away.
      const captions = await getCaptions(deep);
      if (cancelled) return;
      const result = await lookup(captions, force);
      if (cancelled) return;

      // 2. Only if that didn't give lyrics synced to this video, quietly have
      //    YouTube load its captions and try again with them. Once per video.
      const videoId = yt?.videoId;
      const tracksAvailable = Boolean(yt?.captionTracks?.length) && !yt?.isShorts;
      const tryCaptions =
        useCaptions &&
        Boolean(videoId) &&
        tracksAvailable &&
        !captions &&
        (deep || !triedCaptionsRef.current.has(videoId as string)) &&
        needsCaptions(result);
      // Show unsynced lyrics meanwhile, but keep "searching" rather than flash "not found".
      if (!tryCaptions || result.status === 'found') {
        setState({ phase: 'done', track: current, result, deep });
      }
      if (!tryCaptions) return;
      triedCaptionsRef.current.add(videoId as string);
      const loaded = await getCaptions(true);
      if (cancelled) return;
      const improved = loaded ? await lookup(loaded, true) : result;
      if (cancelled) return;
      setState({
        phase: 'done',
        track: current,
        result: isBetter(improved, result) ? improved : result,
        deep,
      });
    })().catch((error: unknown) => {
      if (!cancelled) {
        setState({
          phase: 'done',
          track: current,
          result: { status: 'error', message: String(error) },
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const retry = useCallback(() => {
    forceRef.current = true;
    setAttempt((n) => n + 1);
  }, []);
  /** "Find it anyway": search wider, use the video's captions, accept looser matches. */
  const findAnyway = useCallback(() => {
    if (!key) return;
    deepRef.current = key;
    setAttempt((n) => n + 1);
  }, [key]);
  /** Search with a song title (and optional artist) the user typed. */
  const searchManual = useCallback(
    (title: string, artist: string) => {
      if (!key || !title.trim()) return;
      manualRef.current = { key, title: title.trim(), artist: artist.trim() };
      setAttempt((n) => n + 1);
    },
    [key],
  );

  return { state, retry, findAnyway, searchManual };
}
