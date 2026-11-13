/**
 * Page agent: reports what's playing in this tab to the Lyricy side panel.
 * It never changes the page — no injected UI — so it can't break the site.
 */
import { browser } from 'wxt/browser';
import { fetchCaptions, toCaptionData } from '@/core/agent/captions';
import {
  AGENT_PORT,
  type AgentMessage,
  type CaptionData,
  type CapturedCaptions,
  PAGE_CAPTIONS,
  PAGE_CAPTIONS_LOAD,
  PAGE_CAPTIONS_REQUEST,
  PAGE_SEEK,
  PAGE_SNAPSHOT,
  PAGE_SNAPSHOT_REQUEST,
  type PageSnapshot,
  type PanelMessage,
} from '@/core/agent/protocol';
import { SUPPORTED_SITES } from '@/core/agent/sites';

const POLL_MS = 250;

/** Captions the player has downloaded for this video (captured by the page hooks). */
function readCapturedCaptions(videoId: string): CaptionData | null {
  let raw: CapturedCaptions | null = null;
  const onCaptions = (event: Event) => {
    try {
      raw = JSON.parse(String((event as CustomEvent).detail)) as CapturedCaptions | null;
    } catch {}
  };
  window.addEventListener(PAGE_CAPTIONS, onCaptions, { once: true });
  window.dispatchEvent(new CustomEvent(PAGE_CAPTIONS_REQUEST, { detail: videoId }));
  window.removeEventListener(PAGE_CAPTIONS, onCaptions);
  return raw ? toCaptionData(raw) : null;
}

/** Synchronously asks the page-world hooks for a snapshot (events dispatch synchronously). */
function readPage(): PageSnapshot | null {
  let result: PageSnapshot | null = null;
  const onSnapshot = (event: Event) => {
    try {
      result = JSON.parse(String((event as CustomEvent).detail)) as PageSnapshot | null;
    } catch {}
  };
  window.addEventListener(PAGE_SNAPSHOT, onSnapshot, { once: true });
  window.dispatchEvent(new CustomEvent(PAGE_SNAPSHOT_REQUEST));
  window.removeEventListener(PAGE_SNAPSHOT, onSnapshot);
  return result;
}

const text = (root: ParentNode, selector: string) =>
  root.querySelector(selector)?.textContent?.trim() ?? '';

/** YouTube's "Music in this video" card (song, artist, album), if the page shows one. */
/** People cards use the same component ("A. R. Ameen · Indian playback singer"). */
const PERSON_DESCRIPTION =
  /\b(singer|actor|actress|composer|musician|rapper|lyricist|producer|director|songwriter|band|group|dancer|comedian|youtuber|personality)\b/i;

function readMusicCard(): { title: string; artist: string; album?: string } | undefined {
  // Only song cards have an album line; people/places cards don't.
  for (const card of document.querySelectorAll('yt-video-attribute-view-model')) {
    const title = text(card, '.ytVideoAttributeViewModelTitle');
    const artist = text(card, '.ytVideoAttributeViewModelSubtitle');
    const album = text(card, '.ytVideoAttributeViewModelSecondarySubtitle');
    if (title && artist && album && !PERSON_DESCRIPTION.test(artist)) {
      return { title, artist, album };
    }
  }
  return undefined;
}

function enrich(snapshot: PageSnapshot): PageSnapshot {
  const yt = snapshot.track?.youtube;
  if (snapshot.site === 'youtube' && yt && !yt.isShorts) {
    yt.music = readMusicCard();
  }
  return snapshot;
}

export default defineContentScript({
  matches: SUPPORTED_SITES,
  runAt: 'document_idle',
  main(ctx) {
    const w = window as Window & { __lyricyAgent?: boolean };
    if (w.__lyricyAgent) return;
    w.__lyricyAgent = true;

    browser.runtime.onConnect.addListener((port) => {
      if (port.name !== AGENT_PORT) return;
      let alive = true;
      let last = '';
      let lastSentAt = 0;

      const send = (message: AgentMessage) => {
        try {
          port.postMessage(message);
        } catch {
          alive = false;
        }
      };

      const tick = () => {
        if (!alive) return;
        const snapshot = readPage();
        if (snapshot) {
          const json = JSON.stringify(snapshot);
          const now = Date.now();
          // Always send at least once a second so the panel's clock stays anchored.
          if (json !== last || now - lastSentAt > 1000) {
            last = json;
            lastSentAt = now;
            send({ type: 'snapshot', snapshot: enrich(snapshot) });
          }
        }
      };

      const timer = ctx.setInterval(tick, POLL_MS);
      const onMediaEvent = () => tick();
      for (const type of ['play', 'pause', 'seeked', 'ratechange']) {
        document.addEventListener(type, onMediaEvent, true);
      }
      tick();

      port.onMessage.addListener(async (raw: unknown) => {
        const message = raw as PanelMessage;
        if (message.type === 'seek') {
          window.dispatchEvent(new CustomEvent(PAGE_SEEK, { detail: String(message.seconds) }));
          setTimeout(tick, 50);
        } else if (message.type === 'captions') {
          const yt = readPage()?.track?.youtube;
          if (!yt) {
            send({ type: 'captions', key: message.key, captions: null });
            return;
          }
          if (message.load) {
            window.dispatchEvent(new CustomEvent(PAGE_CAPTIONS_LOAD, { detail: yt.videoId }));
          }
          // Wait for the player's own caption download when we asked for one.
          const deadline = Date.now() + (message.load ? 8000 : 0);
          let captions = readCapturedCaptions(yt.videoId);
          while (!captions && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 300));
            captions = readCapturedCaptions(yt.videoId);
          }
          if (!captions && yt.captionTracks?.length)
            captions = await fetchCaptions(yt.captionTracks);
          send({ type: 'captions', key: message.key, captions });
        }
      });

      port.onDisconnect.addListener(() => {
        alive = false;
        clearInterval(timer);
        for (const type of ['play', 'pause', 'seeked', 'ratechange']) {
          document.removeEventListener(type, onMediaEvent, true);
        }
      });
    });
  },
});
