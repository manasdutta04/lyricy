import { createPortal } from 'preact/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { SUPPORTED_SITE_NAMES } from '@/core/agent/sites';
import { type ScriptMode, scriptModeSetting } from '@/core/settings';
import { useSetting } from '@/core/state/use-setting';
import { LyricsSurface } from '@/ui/LyricsSurface';
import type { Playback } from '@/ui/LyricsView';
import { useAgent } from '@/ui/use-agent';
import { useChapterTrack } from '@/ui/use-chapter-track';
import { useFloatingWindow } from '@/ui/use-floating-window';
import { useLyrics } from '@/ui/use-lyrics';

const SCRIPT_OPTIONS: { value: ScriptMode; label: string; title: string }[] = [
  { value: 'romanized', label: 'English', title: 'English letters, e.g. “Tum hi ho”' },
  { value: 'both', label: 'Both', title: 'English letters with the original underneath' },
  { value: 'original', label: 'Original', title: 'Original script, e.g. “तुम ही हो”' },
];

const ALL_SITES = { origins: ['<all_urls>'] };

function useAllSites() {
  const [granted, setGranted] = useState(false);
  useEffect(() => {
    const refresh = () => void browser.permissions.contains(ALL_SITES).then(setGranted);
    refresh();
    browser.permissions.onAdded.addListener(refresh);
    browser.permissions.onRemoved.addListener(refresh);
    return () => {
      browser.permissions.onAdded.removeListener(refresh);
      browser.permissions.onRemoved.removeListener(refresh);
    };
  }, []);
  const request = useCallback(() => void browser.permissions.request(ALL_SITES), []);
  const revoke = useCallback(() => void browser.permissions.remove(ALL_SITES), []);
  return { granted, request, revoke };
}

/** Small settings pop-up anchored to the gear; closes on Esc or outside click. */
function SettingsPopover({ onClose }: { onClose: () => void }) {
  const scriptMode = useSetting(scriptModeSetting);
  const allSites = useAllSites();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (ref.current?.contains(target) || target?.closest('.settings-toggle')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    ref.current?.querySelector<HTMLElement>('button, input')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose]);

  return (
    <div ref={ref} class="popover" role="dialog" aria-label="Settings">
      <p class="popover-label">Non-English lyrics</p>
      <fieldset class="segmented" aria-label="Lyrics script">
        {SCRIPT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={scriptMode === option.value}
            class={scriptMode === option.value ? 'selected' : ''}
            title={option.title}
            onClick={() => scriptModeSetting.setValue(option.value)}
          >
            {option.label}
          </button>
        ))}
      </fieldset>

      <label class="switch-row" title={`Built in: ${SUPPORTED_SITE_NAMES.join(', ')}`}>
        <span>
          Work on all websites
          <small>Built in for YouTube, Spotify &amp; {SUPPORTED_SITE_NAMES.length - 2} more</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={allSites.granted}
          checked={allSites.granted}
          onChange={(e) => (e.currentTarget.checked ? allSites.request() : allSites.revoke())}
        />
      </label>
    </div>
  );
}

function EmptyState({
  status,
  onReload,
  onEnableAllSites,
}: {
  status: string;
  onReload: () => void;
  onEnableAllSites: () => void;
}) {
  if (status === 'connecting') return <div class="empty" />;
  if (status === 'needs-reload') {
    return (
      <div class="empty">
        <p>Reload this tab to show lyrics.</p>
        <button type="button" class="pill" onClick={onReload}>
          Reload
        </button>
      </div>
    );
  }
  if (status === 'unsupported') {
    return (
      <div class="empty">
        <p>No music on this tab.</p>
        <button type="button" class="link" onClick={onEnableAllSites}>
          Enable on all websites
        </button>
      </div>
    );
  }
  return (
    <div class="empty">
      <p>Play a song to see its lyrics.</p>
    </div>
  );
}

export function App() {
  const agent = useAgent();
  const [showSettings, setShowSettings] = useState(false);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const allSites = useAllSites();

  const site = agent.snapshot?.site ?? 'other';
  // In a jukebox/medley video, the current chapter is the song.
  const { track, startMs } = useChapterTrack(agent.snapshot?.track ?? null, agent.now);
  const { state, retry, searchAnyway, searchManual } = useLyrics(track, site, agent.captions);
  const key = track?.key ?? '';
  const userOffset = offsets[key] ?? 0;

  const playback = useMemo<Playback>(
    () => ({
      // Time within the current song; a positive offset shows lyrics later.
      now: () => agent.now() - startMs - userOffset,
      seek: (ms) => agent.seek(ms + startMs + userOffset),
    }),
    [agent.now, agent.seek, startMs, userOffset],
  );

  const nudge = useCallback(
    (delta: number) => setOffsets((o) => ({ ...o, [key]: (o[key] ?? 0) + delta })),
    [key],
  );
  const closeSettings = useCallback(() => setShowSettings(false), []);
  const floating = useFloatingWindow();

  const content =
    agent.status === 'connected' && track ? (
      <LyricsSurface
        state={state}
        playback={playback}
        isShorts={track.youtube?.isShorts}
        userOffset={userOffset}
        onNudge={nudge}
        onRetry={retry}
        onSearchAnyway={searchAnyway}
        onSearch={searchManual}
      />
    ) : (
      <EmptyState
        status={agent.status === 'connected' ? 'idle' : agent.status}
        onReload={agent.reloadTab}
        onEnableAllSites={allSites.request}
      />
    );

  return (
    <main class="app">
      {floating.supported && (
        <button
          type="button"
          class="icon-button float-toggle"
          onClick={floating.win ? floating.close : floating.open}
          aria-label={floating.win ? 'Close floating lyrics' : 'Floating lyrics window'}
          title={
            floating.win
              ? 'Bring lyrics back to the side panel'
              : 'Floating lyrics window (stays on top, even in fullscreen)'
          }
        >
          ⧉
        </button>
      )}
      <button
        type="button"
        class="icon-button settings-toggle"
        onClick={() => setShowSettings((s) => !s)}
        aria-label="Settings"
        aria-expanded={showSettings}
        title="Settings"
      >
        ⚙
      </button>
      {showSettings && <SettingsPopover onClose={closeSettings} />}

      {floating.win ? (
        <>
          <div class="empty">
            <p>Lyrics are in the floating window.</p>
            <button type="button" class="pill" onClick={floating.close}>
              Bring them back
            </button>
          </div>
          {createPortal(<main class="app">{content}</main>, floating.win.document.body)}
        </>
      ) : (
        content
      )}
    </main>
  );
}
