import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { SUPPORTED_SITE_NAMES } from '@/core/agent/sites';
import { type ScriptMode, scriptModeSetting } from '@/core/settings';
import { useSetting } from '@/core/state/use-setting';
import { LyricsSurface } from '@/ui/LyricsSurface';
import type { Playback } from '@/ui/LyricsView';
import { useAgent } from '@/ui/use-agent';
import { useLyrics } from '@/ui/use-lyrics';

const SCRIPT_OPTIONS: { value: ScriptMode; label: string; hint: string }[] = [
  { value: 'romanized', label: 'English letters', hint: 'Hinglish, romaji… e.g. “Tum hi ho”' },
  { value: 'both', label: 'Both', hint: 'English letters with the original underneath' },
  { value: 'original', label: 'Original script', hint: 'e.g. “तुम ही हो”' },
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

function Settings({ onClose }: { onClose: () => void }) {
  const scriptMode = useSetting(scriptModeSetting);
  const allSites = useAllSites();
  return (
    <div class="settings">
      <header class="settings-header">
        <h1>Settings</h1>
        <button type="button" class="icon-button" onClick={onClose} aria-label="Close settings">
          ×
        </button>
      </header>

      <fieldset class="group">
        <legend>Non-English lyrics</legend>
        {SCRIPT_OPTIONS.map((option) => (
          <label key={option.value} class="option">
            <input
              type="radio"
              name="script"
              checked={scriptMode === option.value}
              onChange={() => scriptModeSetting.setValue(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              <small>{option.hint}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset class="group">
        <legend>Websites</legend>
        <p class="hint">Works out of the box on {SUPPORTED_SITE_NAMES.join(', ')}.</p>
        <label class="option">
          <input
            type="checkbox"
            checked={allSites.granted}
            onChange={(e) => (e.currentTarget.checked ? allSites.request() : allSites.revoke())}
          />
          <span>
            <strong>Every other website too</strong>
            <small>
              Any site that plays music with media controls. Reload open tabs afterwards.
            </small>
          </span>
        </label>
      </fieldset>
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
  if (status === 'connecting') {
    return (
      <div class="empty">
        <p class="hint">Connecting to this tab…</p>
      </div>
    );
  }
  if (status === 'needs-reload') {
    return (
      <div class="empty">
        <p class="big-text">Reload this tab to start</p>
        <p class="hint">The page was open before Lyricy was installed or updated.</p>
        <button type="button" class="action" onClick={onReload}>
          Reload tab
        </button>
      </div>
    );
  }
  if (status === 'unsupported') {
    return (
      <div class="empty">
        <p class="big-text">Play some music</p>
        <p class="hint">
          Open {SUPPORTED_SITE_NAMES.slice(0, 4).join(', ')} or another music site in this tab.
        </p>
        <button type="button" class="action secondary" onClick={onEnableAllSites}>
          Enable Lyricy on all websites
        </button>
      </div>
    );
  }
  return (
    <div class="empty">
      <p class="big-text">Nothing playing</p>
      <p class="hint">Play a song in this tab and its lyrics will appear here.</p>
    </div>
  );
}

export function App() {
  const agent = useAgent();
  const [showSettings, setShowSettings] = useState(false);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const allSites = useAllSites();

  const track = agent.snapshot?.track ?? null;
  const site = agent.snapshot?.site ?? 'other';
  const { state, retry, searchAnyway } = useLyrics(track, site, agent.captions);
  const key = track?.key ?? '';
  const userOffset = offsets[key] ?? 0;

  const playback = useMemo<Playback>(
    () => ({
      // Positive offset = lyrics later; so read the clock earlier.
      now: () => agent.now() - userOffset,
      seek: (ms) => agent.seek(ms + userOffset),
    }),
    [agent.now, agent.seek, userOffset],
  );

  const nudge = useCallback(
    (delta: number) => setOffsets((o) => ({ ...o, [key]: (o[key] ?? 0) + delta })),
    [key],
  );

  return (
    <main class="app">
      <button
        type="button"
        class="icon-button settings-toggle"
        onClick={() => setShowSettings((s) => !s)}
        aria-label="Settings"
        title="Settings"
      >
        ⚙
      </button>

      {showSettings ? (
        <Settings onClose={() => setShowSettings(false)} />
      ) : agent.status === 'connected' && track ? (
        <LyricsSurface
          state={state}
          playback={playback}
          isShorts={track.youtube?.isShorts}
          userOffset={userOffset}
          onNudge={nudge}
          onRetry={retry}
          onSearchAnyway={searchAnyway}
        />
      ) : (
        <EmptyState
          status={agent.status === 'connected' ? 'idle' : agent.status}
          onReload={agent.reloadTab}
          onEnableAllSites={allSites.request}
        />
      )}
    </main>
  );
}
