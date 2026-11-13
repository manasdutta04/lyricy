import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import {
  AGENT_PORT,
  type AgentMessage,
  type CaptionData,
  type PageSnapshot,
  type PanelMessage,
  type PlaybackSnapshot,
} from '@/core/agent/protocol';
import { SUPPORTED_SITES } from '@/core/agent/sites';
import { TimestampClock } from '@/core/sync/timestamp-clock';

export type AgentStatus =
  /** Looking for the active tab / connecting. */
  | 'connecting'
  /** Connected to the page agent. */
  | 'connected'
  /** Supported site, but the tab was opened before Lyricy was installed/updated. */
  | 'needs-reload'
  /** Lyricy isn't enabled on this site. */
  | 'unsupported';

type Anchor = PlaybackSnapshot;

function matchesPattern(url: string, pattern: string): boolean {
  const m = pattern.match(/^\*:\/\/(\*\.)?([^/]+)\/\*$/);
  if (!m) return false;
  try {
    const host = new URL(url).hostname;
    const domain = m[2] ?? '';
    return m[1] ? host === domain || host.endsWith(`.${domain}`) : host === domain;
  } catch {
    return false;
  }
}

const isSupportedUrl = (url: string | undefined) =>
  !!url && SUPPORTED_SITES.some((p) => matchesPattern(url, p));

/**
 * Connects the side panel to the agent in the active tab of this window and keeps
 * a smooth playback clock from its snapshots. Follows tab switches and reloads.
 */
export function useAgent() {
  const [status, setStatus] = useState<AgentStatus>('connecting');
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);
  const tabIdRef = useRef<number | null>(null);
  const portRef = useRef<ReturnType<typeof browser.tabs.connect> | null>(null);
  const anchorRef = useRef<Anchor | null>(null);
  const waitersRef = useRef(new Map<string, (c: CaptionData | null) => void>());
  const clockRef = useRef(new TimestampClock(() => anchorRef.current));

  const connect = useCallback(async (force = false) => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('unsupported');
      return;
    }
    // Same tab and still connected: nothing to do (avoids re-fetching on focus changes).
    if (!force && tab.id === tabIdRef.current && portRef.current) return;

    const sameTab = tab.id === tabIdRef.current;
    portRef.current?.disconnect();
    portRef.current = null;
    if (!sameTab) {
      anchorRef.current = null;
      setSnapshot(null);
      setStatus('connecting');
    }
    tabIdRef.current = tab.id;
    const id = tab.id;

    let gotMessage = false;
    let port: ReturnType<typeof browser.tabs.connect>;
    try {
      port = browser.tabs.connect(id, { name: AGENT_PORT });
    } catch {
      setStatus(isSupportedUrl(tab.url) ? 'needs-reload' : 'unsupported');
      return;
    }
    portRef.current = port;

    port.onMessage.addListener((raw: unknown) => {
      const message = raw as AgentMessage;
      gotMessage = true;
      if (message.type === 'snapshot') {
        setStatus('connected');
        setSnapshot(message.snapshot);
        anchorRef.current = message.snapshot.playback;
      } else if (message.type === 'captions') {
        waitersRef.current.get(message.key)?.(message.captions);
        waitersRef.current.delete(message.key);
      }
    });

    port.onDisconnect.addListener(async () => {
      if (portRef.current !== port) return;
      portRef.current = null;
      if (gotMessage) {
        // Page navigated or reloaded: try again shortly.
        setTimeout(() => void connect(true), 800);
        return;
      }
      const allSites = await browser.permissions
        .contains({ origins: ['<all_urls>'] })
        .catch(() => false);
      const canRun = isSupportedUrl(tab.url) || (allSites && /^https?:/.test(tab.url ?? 'https:'));
      setStatus(canRun ? 'needs-reload' : 'unsupported');
    });
  }, []);

  useEffect(() => {
    void connect();
    const onActivated = () => void connect();
    // Full reloads are handled by the port disconnecting; this covers a tab whose
    // agent wasn't reachable yet (e.g. it finished loading after the panel opened).
    const onUpdated = (id: number, info: { status?: string }) => {
      if (id === tabIdRef.current && info.status === 'complete' && !portRef.current) {
        void connect(true);
      }
    };
    const onFocus = () => void connect();
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.windows.onFocusChanged.addListener(onFocus);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.windows.onFocusChanged.removeListener(onFocus);
    };
  }, [connect]);

  useEffect(() => () => portRef.current?.disconnect(), []);

  const post = useCallback((message: PanelMessage) => {
    try {
      portRef.current?.postMessage(message);
    } catch {}
  }, []);

  const seek = useCallback(
    (ms: number) => {
      post({ type: 'seek', seconds: Math.max(0, ms / 1000) });
      if (anchorRef.current) anchorRef.current = { ...anchorRef.current, positionMs: ms };
    },
    [post],
  );

  /** YouTube captions for the current video (best effort, 5 s timeout). */
  /**
   * YouTube captions for the current video. With `load`, the page first has the
   * player download them (briefly turning CC on), which takes a few seconds.
   */
  const captions = useCallback(
    (key: string, load = false) =>
      new Promise<CaptionData | null>((resolve) => {
        const timer = setTimeout(
          () => {
            waitersRef.current.delete(key);
            resolve(null);
          },
          load ? 12_000 : 3_000,
        );
        waitersRef.current.set(key, (c) => {
          clearTimeout(timer);
          resolve(c);
        });
        post({ type: 'captions', key, load });
      }),
    [post],
  );

  const now = useCallback(() => clockRef.current.read(), []);
  const reloadTab = useCallback(() => {
    if (tabIdRef.current !== null) void browser.tabs.reload(tabIdRef.current);
  }, []);

  return { status, snapshot, now, seek, captions, reconnect: () => connect(true), reloadTab };
}
