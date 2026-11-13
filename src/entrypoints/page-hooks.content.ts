/**
 * Runs in the page's own JS world (no extension APIs) to observe playback on any
 * site — including players whose <audio> isn't in the DOM (e.g. Spotify).
 * It only reads state and seeks on request; it never changes the page's UI.
 * Every hook is wrapped so a failure here can't break the site.
 */
import {
  type CapturedCaptions,
  PAGE_CAPTIONS,
  PAGE_CAPTIONS_LOAD,
  PAGE_CAPTIONS_REQUEST,
  PAGE_SEEK,
  PAGE_SNAPSHOT,
  PAGE_SNAPSHOT_REQUEST,
  type PageSnapshot,
  type SiteKind,
  type TrackSnapshot,
  type YouTubeInfo,
} from '@/core/agent/protocol';
import { SUPPORTED_SITES } from '@/core/agent/sites';
import { type Chapter, parseDescriptionChapters } from '@/core/youtube/chapters';

interface YtPlayer extends HTMLElement {
  getPlayerResponse?: () => {
    videoDetails?: {
      videoId?: string;
      title?: string;
      author?: string;
      lengthSeconds?: string;
      shortDescription?: string;
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
  getOption?: (module: string, option: string) => unknown;
  setOption?: (module: string, option: string, value: unknown) => void;
  loadModule?: (module: string) => void;
  toggleSubtitlesOn?: () => void;
  toggleSubtitles?: () => void;
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

  /**
   * YouTube's mini player keeps the video playing in a corner while the user
   * browses (the page is then not /watch). The same #movie_player moves into it.
   */
  function inMiniplayer(): boolean {
    if (site !== 'youtube') return false;
    const app = document.querySelector('ytd-app');
    if (app?.hasAttribute('miniplayer-is-active')) return true;
    if (document.querySelector('ytd-miniplayer[active]')) return true;
    const player = ytPlayer();
    if (player?.closest('ytd-miniplayer, .ytdMiniplayerComponentHost')) return true;
    // Fallback: the main player is still playing a video off the watch page
    // (never a hover preview on the home page, which is its own small player).
    if (!player || player.closest('ytd-video-preview, #inline-preview-player, #inline-player')) {
      return false;
    }
    const video = player?.querySelector<HTMLVideoElement>('video.html5-main-video');
    return Boolean(video && !video.paused && !video.ended && video.currentTime > 0);
  }

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

  /** Chapters from the description, else from YouTube's own chapter data (first page load). */
  let chapterCache: { videoId: string; chapters: Chapter[] | undefined } | null = null;
  function readChapters(videoId: string, description: string, lengthSec: number) {
    // Snapshots run 4×/second; chapters only change with the video.
    if (chapterCache?.videoId === videoId) return chapterCache.chapters;
    const chapters = findChapters(videoId, description, lengthSec);
    chapterCache = { videoId, chapters };
    return chapters;
  }

  function findChapters(
    videoId: string,
    description: string,
    lengthSec: number,
  ): Chapter[] | undefined {
    const fromDescription = parseDescriptionChapters(description, lengthSec);
    if (fromDescription.length) return fromDescription;
    try {
      const data = (window as Window & { ytInitialData?: unknown }).ytInitialData as
        | { currentVideoEndpoint?: { watchEndpoint?: { videoId?: string } } }
        | undefined;
      if (data?.currentVideoEndpoint?.watchEndpoint?.videoId !== videoId) return undefined;
      const json = JSON.stringify(data);
      const found = [
        ...json.matchAll(
          /"chapterRenderer":\{"title":\{"simpleText":"((?:[^"\\]|\\.)*)"\},"timeRangeStartMillis":(\d+)/g,
        ),
      ].map((m) => ({ title: JSON.parse(`"${m[1]}"`) as string, startSec: Number(m[2]) / 1000 }));
      const unique = [...new Map(found.map((c) => [c.startSec, c])).values()];
      return unique.length >= 2 ? unique.sort((a, b) => a.startSec - b.startSec) : undefined;
    } catch {
      return undefined;
    }
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
        chapters: readChapters(
          vd.videoId,
          vd.shortDescription ?? '',
          Number(vd.lengthSeconds) || 0,
        ),
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
      if (
        yt &&
        (site === 'ytmusic' || location.pathname === '/watch' || isShorts() || inMiniplayer())
      ) {
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
        at: Date.now(),
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
        at: Date.now(),
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

  if (site !== 'other') installCaptionCapture(ytPlayer);
}

/**
 * YouTube's player downloads caption files itself (with tokens we can't make) when
 * CC is on. We passively keep a copy of what it downloads, per video, so lyrics can
 * use them. Nothing about the request or response is changed.
 */
function installCaptionCapture(ytPlayer: () => YtPlayer | null) {
  const captured = new Map<string, CapturedCaptions>();

  const remember = (url: string, body: string) => {
    try {
      const u = new URL(url, location.origin);
      const videoId = u.searchParams.get('v');
      if (!videoId || !body) return;
      const json = JSON.parse(body) as { events?: unknown[] };
      if (!json.events?.length) return;
      // `kind=asr` marks auto-generated captions (`caps=asr` is just a capability flag).
      const asr = u.searchParams.get('kind') === 'asr';
      const language = u.searchParams.get('lang') ?? '';
      const entry = captured.get(videoId) ?? {};
      entry[asr ? 'asr' : 'manual'] = { language, json };
      captured.set(videoId, entry);
      if (captured.size > 20) captured.delete(captured.keys().next().value as string);
    } catch {
      // Not json3 or not a caption file: ignore.
    }
  };

  try {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function open(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      try {
        const href = String(url);
        if (href.includes('/api/timedtext')) {
          this.addEventListener('load', () => {
            try {
              remember(href, typeof this.response === 'string' ? this.response : this.responseText);
            } catch {}
          });
        }
      } catch {}
      return (originalOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof XMLHttpRequest.prototype.open;
  } catch {}

  try {
    const originalFetch = window.fetch;
    window.fetch = async function fetchWithCapture(...args: Parameters<typeof fetch>) {
      const response = await originalFetch.apply(this, args);
      try {
        const input = args[0];
        const href =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (href.includes('/api/timedtext')) {
          response
            .clone()
            .text()
            .then((body) => remember(href, body))
            .catch(() => {});
        }
      } catch {}
      return response;
    };
  } catch {}

  window.addEventListener(PAGE_CAPTIONS_REQUEST, (event) => {
    let detail = 'null';
    try {
      detail = JSON.stringify(captured.get(String((event as CustomEvent).detail)) ?? null);
    } catch {}
    window.dispatchEvent(new CustomEvent(PAGE_CAPTIONS, { detail }));
  });

  // Asked by the user from the panel: have the player load captions, then put CC
  // back the way it was once they've arrived.
  window.addEventListener(PAGE_CAPTIONS_LOAD, (event) => {
    try {
      const videoId = String((event as CustomEvent).detail);
      const player = ytPlayer();
      if (!player || captured.get(videoId)?.manual || captured.get(videoId)?.asr) return;
      const wasOn = Boolean(
        (player.getOption?.('captions', 'track') as { languageCode?: string } | undefined)
          ?.languageCode,
      );
      if (wasOn) {
        // CC is on but we have nothing: switching it off and on makes the player
        // download the captions again. It ends up on, as it was.
        player.toggleSubtitles?.();
        setTimeout(() => player.toggleSubtitles?.(), 400);
        return;
      }
      player.loadModule?.('captions');
      player.toggleSubtitlesOn?.();
      const started = Date.now();
      const timer = setInterval(() => {
        const done = captured.get(videoId);
        if (done || Date.now() - started > 8000) {
          clearInterval(timer);
          try {
            player.toggleSubtitles?.(); // back off, as it was
          } catch {}
        }
      }, 250);
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
