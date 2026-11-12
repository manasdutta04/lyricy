import { browser } from 'wxt/browser';
import { SUPPORTED_SITES } from '@/core/agent/sites';
import { getCached, pruneOldVersions, setCached } from '@/core/cache';
import type { LyricsResult, VideoDetails } from '@/core/lyrics/types';
import { isFindLyricsMessage } from '@/core/messages';
import { findLyrics } from '@/core/pipeline';

const inFlight = new Map<string, Promise<LyricsResult>>();

async function resolve(video: VideoDetails, force: boolean): Promise<LyricsResult> {
  if (!force) {
    const cached = await getCached(video.videoId);
    if (cached) return cached;
  }
  const result = await findLyrics(video, {
    fetch: (input, init) => fetch(input, init),
    log: import.meta.env.DEV ? (...args) => console.debug('[lyricy]', ...args) : undefined,
  });
  await setCached(video.videoId, result);
  return result;
}

const ALL_SITES = ['<all_urls>'];
const DYNAMIC_IDS = ['lyricy-hooks-all', 'lyricy-agent-all'];

/** When the user enables "every other website", run the agent everywhere else too. */
async function syncAllSitesScripts(): Promise<void> {
  try {
    const granted = await browser.permissions.contains({ origins: ALL_SITES });
    const existing = await browser.scripting.getRegisteredContentScripts({ ids: DYNAMIC_IDS });
    if (existing.length) {
      await browser.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
    }
    if (!granted) return;
    await browser.scripting.registerContentScripts([
      {
        id: DYNAMIC_IDS[0] as string,
        matches: ALL_SITES,
        excludeMatches: SUPPORTED_SITES,
        js: ['content-scripts/page-hooks.js'],
        runAt: 'document_start',
        world: 'MAIN',
      },
      {
        id: DYNAMIC_IDS[1] as string,
        matches: ALL_SITES,
        excludeMatches: SUPPORTED_SITES,
        js: ['content-scripts/agent.js'],
        runAt: 'document_idle',
      },
    ]);
  } catch (error) {
    console.warn('[lyricy] could not update all-sites scripts', error);
  }
}

export default defineBackground(() => {
  // Clicking the toolbar icon opens the lyrics side panel.
  browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  browser.runtime.onInstalled.addListener(() => {
    pruneOldVersions().catch(() => {});
    void syncAllSitesScripts();
  });
  browser.runtime.onStartup.addListener(() => void syncAllSitesScripts());
  browser.permissions.onAdded.addListener(() => void syncAllSitesScripts());
  browser.permissions.onRemoved.addListener(() => void syncAllSitesScripts());

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isFindLyricsMessage(message)) return;

    const { video, force = false } = message;
    let job = inFlight.get(video.videoId);
    if (!job || force) {
      job = resolve(video, force).finally(() => inFlight.delete(video.videoId));
      inFlight.set(video.videoId, job);
    }
    job.then(sendResponse, (error: unknown) =>
      sendResponse({ status: 'error', message: String(error) } satisfies LyricsResult),
    );
    return true; // keep the channel open for the async response
  });
});
