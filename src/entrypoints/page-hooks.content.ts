/**
 * Runs in the page's own JS world (no extension APIs) to observe playback on any
 * site — including players whose <audio> isn't in the DOM (e.g. Spotify).
 * It only reads state and seeks on request; it never changes the page's UI.
 * Every hook is wrapped so a failure here can't break the site.
 */
import {
  PAGE_SEEK,
  PAGE_SNAPSHOT,
  PAGE_SNAPSHOT_REQUEST,
  type PageSnapshot,
  type SiteKind,
  type TrackSnapshot,
  type YouTubeInfo,
} from '@/core/agent/protocol';
import { SUPPORTED_SITES } from '@/core/agent/sites';

interface YtPlayer extends HTMLElement {
  getPlayerResponse?: () => {
    videoDetails?: {
      videoId?: string;
      title?: string;
      author?: string;
      lengthSeconds?: string;
      isLiveContent?: boolean;
    };
    microformat?: { playerMicroformatRenderer?: { category?: string } };
    captions?: {
      playerCaptionsTracklistRenderer?: {
        captionTracks?: {
          baseUrl?: string;
          languageCode?: string;
          kind?: string;
          name?: { simpleText?: string; runs?: { text?: string }[] };
        }[];
      };
    };
  };
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
}

interface PositionState {
  duration: number;
  playbackRate: number;
  position: number;
  at: number;
}

function install() {
  const w = window as Window & { __lyricyHooks?: boolean };
  if (w.__lyricyHooks) return;
  w.__lyricyHooks = true;

  // --- Track media elements, including detached ones created with new Audio() ---
  const media = new Set<WeakRef<HTMLMediaElement>>();
  const seen = new WeakSet<HTMLMediaElement>();
  const remember = (el: unknown) => {
    if (el instanceof HTMLMediaElement && !seen.has(el)) {
      seen.add(el);
      media.add(new WeakRef(el));
    }
  };
  try {
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement, ...args) {
      try {
        remember(this);
      } catch {}
      return originalPlay.apply(this, args);
    };
  } catch {}
  document.addEventListener('play', (e) => remember(e.target), true);

  // --- MediaSession: position reports and the page's own seek handler ---
  let position: PositionState | null = null;
  let seekHandler: ((details: MediaSessionActionDetails) => void) | null = null;
  try {
    const session = navigator.mediaSession;
    const originalSetPosition = session.setPositionState?.bind(session);
    if (originalSetPosition) {
      session.setPositionState = (state?: MediaPositionState) => {
        try {
          position = state?.duration
            ? {
                duration: state.duration,
                playbackRate: state.playbackRate ?? 1,
                position: state.position ?? 0,
                at: performance.now(),
              }
            : null;
        } catch {}
        return originalSetPosition(state);
      };
    }
    const originalSetHandler = session.setActionHandler.bind(session);
    session.setActionHandler = (action, handler) => {
      try {
        if (action === 'seekto') seekHandler = handler;
      } catch {}
      return originalSetHandler(action, handler);
    };
  } catch {}

  const host = location.hostname;
  const site: SiteKind =
    host === 'music.youtube.com' ? 'ytmusic' : host.endsWith('youtube.com') ? 'youtube' : 'other';
  const isShorts = () => location.pathname.startsWith('/shorts/');

  const ytPlayer = () =>
    document.getElementById(isShorts() ? 'shorts-player' : 'movie_player') as YtPlayer | null;

  function activeMedia(): HTMLMediaElement | null {
    if (site !== 'other') {
      const player = ytPlayer();
      const video =
        player?.querySelector<HTMLVideoElement>('video.html5-main-video') ??
        player?.querySelector<HTMLVideoElement>('video');
      if (video) return video;
    }
    for (const el of document.querySelectorAll('video, audio')) remember(el);
    let best: HTMLMediaElement | null = null;
    let bestScore = -1;
    for (const ref of media) {
      const el = ref.deref();
      if (!el) {
        media.delete(ref);
        continue;
      }
      const duration = Number.isFinite(el.duration) ? el.duration : 0;
      // Prefer what's playing, then longer media (skips UI sounds and previews).
      const score = (el.paused ? 0 : 1e6) + (el.muted ? 0 : 1e5) + duration;
      if (duration > 0 && score > bestScore) {
        best = el;
        bestScore = score;
      }
    }
    return best;
  }

  function artwork(): string | undefined {
    const art = navigator.mediaSession?.metadata?.artwork;
    if (!art?.length) return undefined;
    const size = (a: MediaImage) => Number.parseInt(a.sizes?.split('x')[0] ?? '0', 10) || 0;
    return [...art].sort((a, b) => size(b) - size(a))[0]?.src;
  }

  function youtubeInfo(): YouTubeInfo | undefined {
    try {
      const response = ytPlayer()?.getPlayerResponse?.();
      const vd = response?.videoDetails;
      if (!vd?.videoId) return undefined;
      const tracks =
        response?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.flatMap((t) =>
          t.baseUrl
            ? [
                {
                  baseUrl: t.baseUrl,
                  languageCode: t.languageCode ?? '',
                  kind: t.kind,
                  name: t.name?.simpleText ?? t.name?.runs?.map((r) => r.text).join('') ?? '',
                },
              ]
            : [],
        ) ?? [];
      return {
        videoId: vd.videoId,
        title: vd.title ?? '',
        author: vd.author ?? '',
        lengthSec: Number(vd.lengthSeconds) || 0,
        isLive: Boolean(vd.isLiveContent),
        isShorts: isShorts(),
        category: response?.microformat?.playerMicroformatRenderer?.category,
        captionTracks: tracks,
      };
    } catch {
      return undefined;
    }
  }

  function snapshot(): PageSnapshot {
    const el = activeMedia();
    const meta = navigator.mediaSession?.metadata;
    const ad = site !== 'other' && Boolean(ytPlayer()?.classList.contains('ad-showing'));

    let track: TrackSnapshot | null = null;
    if (site !== 'other') {
      const yt = youtubeInfo();
      if (yt && (site === 'ytmusic' || location.pathname === '/watch' || isShorts())) {
        track = {
          key: yt.videoId,
          title: site === 'ytmusic' && meta?.title ? meta.title : yt.title,
          artist: site === 'ytmusic' && meta?.artist ? meta.artist : yt.author,
          album: site === 'ytmusic' ? meta?.album || undefined : undefined,
          artworkUrl: site === 'ytmusic' ? artwork() : undefined,
          durationSec: yt.lengthSec || undefined,
          youtube: yt,
        };
      }
    } else if (meta?.title) {
      const duration = el && Number.isFinite(el.duration) ? el.duration : position?.duration;
      track = {
        key: `${host}|${meta.artist}|${meta.title}`,
        title: meta.title,
        artist: meta.artist ?? '',
        album: meta.album || undefined,
        artworkUrl: artwork(),
        durationSec: duration ? Math.round(duration) : undefined,
      };
    }

    let playback: PageSnapshot['playback'] = null;
    if (el) {
      playback = {
        positionMs: el.currentTime * 1000,
        playing: !el.paused && !el.ended && el.readyState >= 2,
        rate: el.playbackRate || 1,
        ad,
      };
    } else if (position) {
      const playing = navigator.mediaSession?.playbackState === 'playing';
      const elapsed = playing
        ? ((performance.now() - position.at) / 1000) * position.playbackRate
        : 0;
      playback = {
        positionMs: Math.min(position.duration, position.position + elapsed) * 1000,
        playing,
        rate: position.playbackRate,
        ad: false,
      };
    }

    return { site, host, track, playback };
  }

  window.addEventListener(PAGE_SNAPSHOT_REQUEST, () => {
    let detail = 'null';
    try {
      detail = JSON.stringify(snapshot());
    } catch {}
    window.dispatchEvent(new CustomEvent(PAGE_SNAPSHOT, { detail }));
  });

  window.addEventListener(PAGE_SEEK, (event) => {
    try {
      const seconds = Number((event as CustomEvent).detail);
      if (!Number.isFinite(seconds)) return;
      const player = site !== 'other' ? ytPlayer() : null;
      if (player?.seekTo) return player.seekTo(seconds, true);
      const el = activeMedia();
      if (el && Number.isFinite(el.duration)) el.currentTime = seconds;
      else seekHandler?.({ action: 'seekto', seekTime: seconds });
    } catch {}
  });
}

export default defineContentScript({
  matches: SUPPORTED_SITES,
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    try {
      install();
    } catch {
      // Never let Lyricy break the page.
    }
  },
});
