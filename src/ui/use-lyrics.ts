import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { CaptionData, TrackSnapshot } from '@/core/agent/protocol';
import type { LyricsResult, TrackInfo, VideoDetails } from '@/core/lyrics/types';
import { requestLyrics } from '@/core/messages';

/** YouTube categories we search automatically; others get a "Search anyway" button. */
const AUTO_CATEGORIES = new Set(['Music', 'Entertainment']);

export type LyricsState =
  | { phase: 'idle' }
  | { phase: 'loading'; track: TrackSnapshot }
  | { phase: 'skipped'; track: TrackSnapshot }
  | { phase: 'done'; track: TrackSnapshot; result: LyricsResult };

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
      videoId: yt.videoId,
      title: yt.title,
      author: yt.author,
      lengthSec: yt.lengthSec,
      category: yt.category,
      isLive: yt.isLive,
      site,
      music: yt.music,
      captions,
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

/** One lyrics lookup per track, re-run on retry / "search anyway". */
export function useLyrics(
  track: TrackSnapshot | null,
  site: 'youtube' | 'ytmusic' | 'other',
  fetchCaptions: (key: string) => Promise<CaptionData | null>,
) {
  const [state, setState] = useState<LyricsState>({ phase: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const forceRef = useRef(false);
  const allowRef = useRef<string | null>(null);
  const manualRef = useRef<{ key: string; title: string; artist: string } | null>(null);
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
      const gated =
        site === 'youtube' &&
        yt &&
        !yt.isShorts &&
        !yt.music &&
        yt.category &&
        !AUTO_CATEGORIES.has(yt.category) &&
        allowRef.current !== key;
      if (gated) {
        setState({ phase: 'skipped', track: current });
        return;
      }
      const captions = yt && site !== 'other' && !yt.isChapter ? await fetchCaptions(key) : null;
      if (cancelled) return;
      const manual = manualRef.current?.key === key ? manualRef.current : null;
      const force = forceRef.current || Boolean(manual);
      forceRef.current = false;
      manualRef.current = null;
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
      const result = await requestLyrics(request, force);
      if (!cancelled) setState({ phase: 'done', track: current, result });
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
  const searchAnyway = useCallback(() => {
    allowRef.current = key;
    setAttempt((n) => n + 1);
  }, [key]);
  /** Search with a song title (and optional artist) the user typed. */
  const searchManual = useCallback(
    (title: string, artist: string) => {
      if (!key || !title.trim()) return;
      manualRef.current = { key, title: title.trim(), artist: artist.trim() };
      allowRef.current = key;
      setAttempt((n) => n + 1);
    },
    [key],
  );

  return { state, retry, searchAnyway, searchManual };
}
