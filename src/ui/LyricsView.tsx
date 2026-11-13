import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Script } from '@/core/lang/script';
import type { LyricLine, Lyrics } from '@/core/lyrics/types';
import { type ScriptMode, scriptModeSetting } from '@/core/settings';
import { useSetting } from '@/core/state/use-setting';
import { findActiveIndex } from '@/core/sync/active-line';

/** Active line sits this far down the viewport (Apple keeps it in the upper third). */
const ANCHOR = 0.3;
/** Switch lines a little early so the highlight is fully visible as the singer arrives. */
const LEAD_MS = 280;
/** Per-line delay for the ripple as lines below the active one catch up. */
const RIPPLE_MS = 35;
const MAX_RIPPLE_STEPS = 8;
/** After a manual scroll, glide back to the active line after this long. */
const BROWSE_IDLE_MS = 2500;
/** Show the lead-in dots if the first line starts later than this. */
const LEAD_IN_MS = 2500;

interface ViewProps {
  lyrics: Lyrics;
  mode: ScriptMode;
}

/** Playback position source (ms) and seek action, supplied by the host page/panel. */
export interface Playback {
  now: () => number;
  seek: (ms: number) => void;
}

const LANG_BY_SCRIPT: Partial<Record<Script, string>> = {
  devanagari: 'hi',
  gurmukhi: 'pa',
  bengali: 'bn',
  japanese: 'ja',
  han: 'zh',
  hangul: 'ko',
};

/** One line in the chosen script: romanized (Hinglish, romaji…), original, or both. */
function LineText({ line, lyrics, mode }: { line: LyricLine; lyrics: Lyrics; mode: ScriptMode }) {
  const lang = lyrics.script ? LANG_BY_SCRIPT[lyrics.script] : undefined;
  const romanized = line.romanized && line.romanized !== line.text ? line.romanized : undefined;
  if (mode === 'original' || !romanized) return <span lang={lang}>{line.text}</span>;
  return (
    <>
      <span lang={lang ? `${lang}-Latn` : undefined}>{romanized}</span>
      {mode === 'both' && (
        <span class="sub" lang={lang}>
          {line.text}
        </span>
      )}
    </>
  );
}

interface Layout {
  tops: number[];
  viewport: number;
}

function useActiveLine(lyrics: Lyrics, now: () => number): number {
  const [active, setActive] = useState(-1);
  useEffect(() => {
    let current = Number.NaN;
    let frame = 0;
    const tick = () => {
      const index = findActiveIndex(lyrics.lines, now() + LEAD_MS);
      if (index !== current) {
        current = index;
        setActive(index);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [lyrics, now]);
  return active;
}

function SyncedLyrics({ lyrics, mode, playback }: ViewProps & { playback: Playback }) {
  const active = useActiveLine(lyrics, playback.now);
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const leadInRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [layout, setLayout] = useState<Layout>({ tops: [], viewport: 0 });
  const [manual, setManual] = useState(0);
  const [browsing, setBrowsing] = useState(false);
  const idleTimer = useRef<number | undefined>(undefined);

  const hasLeadIn = (lyrics.lines[0]?.start ?? 0) > LEAD_IN_MS;

  // Measure line positions (offsetTop ignores transforms) whenever size or fonts change.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return;
    const measure = () =>
      setLayout({
        tops: lineRefs.current.slice(0, lyrics.lines.length).map((el) => el?.offsetTop ?? 0),
        viewport: viewport.clientHeight,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(list);
    return () => observer.disconnect();
  }, [lyrics]);

  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const leadInTop = leadInRef.current?.offsetTop ?? 0;
  const anchorTop = active >= 0 ? (layout.tops[active] ?? 0) : leadInTop;
  const lastTop = layout.tops[layout.tops.length - 1] ?? 0;
  const firstTop = hasLeadIn ? leadInTop : (layout.tops[0] ?? 0);
  const translate = layout.viewport * ANCHOR - anchorTop + manual;

  const stopBrowsing = () => {
    clearTimeout(idleTimer.current);
    setManual(0);
    setBrowsing(false);
  };

  const onWheel = (event: WheelEvent) => {
    const maxUp = anchorTop - firstTop; // can reveal lines above
    const maxDown = lastTop - anchorTop; // can reveal lines below
    const next = Math.min(maxUp, Math.max(-maxDown, manual - event.deltaY));
    if (next === manual) return; // at an edge: let the page scroll instead
    event.preventDefault();
    setManual(next);
    setBrowsing(true);
    clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(stopBrowsing, BROWSE_IDLE_MS);
  };

  const transformFor = (index: number) => {
    const steps = Math.min(Math.max(index - active, 0), MAX_RIPPLE_STEPS);
    return {
      transform: `translate3d(0, ${translate}px, 0)`,
      transitionDelay: browsing ? '0ms' : `${steps * RIPPLE_MS}ms`,
    };
  };

  return (
    <div
      ref={viewportRef}
      class={`viewport synced${browsing ? ' browsing' : ''}`}
      onWheel={onWheel}
    >
      <div ref={listRef} class="lines">
        {hasLeadIn && (
          <div
            ref={leadInRef}
            class={`line lead-in${active === -1 ? ' active' : ' past'}`}
            style={transformFor(-1)}
            aria-hidden="true"
          >
            <span class="dot" />
            <span class="dot" />
            <span class="dot" />
          </div>
        )}
        {lyrics.lines.map((line, i) => {
          const distance = Math.min(Math.abs(i - active), 4);
          const state = i === active ? 'active' : i < active ? 'past' : 'future';
          return (
            <button
              type="button"
              key={`${line.start}-${i}`}
              ref={(el) => {
                lineRefs.current[i] = el;
              }}
              class={`line ${state} d${distance}`}
              style={transformFor(i)}
              onClick={() => {
                stopBrowsing();
                playback.seek(line.start);
              }}
            >
              <LineText line={line} lyrics={lyrics} mode={mode} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function UnsyncedLyrics({
  lyrics,
  mode,
  notice,
  action,
}: ViewProps & { notice: string; action?: ComponentChildren }) {
  return (
    <div class="viewport unsynced">
      <p class="notice">
        {notice} {action}
      </p>
      {lyrics.lines.map((line, i) => (
        <p key={i} class="line static">
          <LineText line={line} lyrics={lyrics} mode={mode} />
        </p>
      ))}
    </div>
  );
}

export function LyricsView({
  lyrics,
  playback,
  unsyncedNotice,
  action,
}: {
  lyrics: Lyrics;
  playback: Playback;
  /** Show as plain text with this notice even if timed (e.g. Shorts play a clip). */
  unsyncedNotice?: string;
  /** Optional control shown with the "not synced" notice (e.g. use YouTube captions). */
  action?: ComponentChildren;
}) {
  const mode = useSetting(scriptModeSetting);
  if (unsyncedNotice) {
    return <UnsyncedLyrics lyrics={lyrics} mode={mode} notice={unsyncedNotice} action={action} />;
  }
  if (lyrics.videoMismatch) {
    return (
      <UnsyncedLyrics
        lyrics={lyrics}
        mode={mode}
        notice="Timed for another version of this song, so shown without sync."
        action={action}
      />
    );
  }
  if (lyrics.sync === 'none') {
    return (
      <UnsyncedLyrics
        lyrics={lyrics}
        mode={mode}
        notice="These lyrics aren't time-synced."
        action={action}
      />
    );
  }
  return <SyncedLyrics lyrics={lyrics} mode={mode} playback={playback} />;
}
