import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Script } from '@/core/lang/script';
import type { LyricLine, Lyrics } from '@/core/lyrics/types';
import { type ScriptMode, scriptModeSetting } from '@/core/settings';
import { useSetting } from '@/core/state/use-setting';
import { findActiveIndex } from '@/core/sync/active-line';

/** Active line sits this far down the viewport (Apple keeps it in the upper third). */
const ANCHOR = 0.3;
/** Switch lines slightly early so the scroll animation lands on the beat. */
const LEAD_MS = 120;
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

function UnsyncedLyrics({ lyrics, mode, notice }: ViewProps & { notice: string }) {
  return (
    <div class="viewport unsynced">
      <p class="notice">{notice}</p>
      {lyrics.lines.map((line, i) => (
        <p key={i} class="line static">
          <LineText line={line} lyrics={lyrics} mode={mode} />
        </p>
      ))}
    </div>
  );
}

/** How quickly the follow view eases toward its target scroll position (per frame). */
const FOLLOW_EASE = 0.06;
/** After the user scrolls, stop following for this long. */
const FOLLOW_PAUSE_MS = 4000;

/**
 * For lyrics we can't time line by line (plain text, or timed for a different cut
 * of the song than this video): scroll steadily with playback progress instead of
 * highlighting lines that would be wrong.
 */
function FollowLyrics({
  lyrics,
  mode,
  playback,
  durationMs,
  notice,
}: ViewProps & { playback: Playback; durationMs: number; notice: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const el = ref.current;
      if (el && performance.now() > pausedUntil.current) {
        const progress = Math.min(1, Math.max(0, playback.now() / durationMs));
        const target = progress * Math.max(0, el.scrollHeight - el.clientHeight);
        const delta = target - el.scrollTop;
        if (Math.abs(delta) > 0.5) el.scrollTop += delta * FOLLOW_EASE;
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [playback, durationMs]);

  const pause = () => {
    pausedUntil.current = performance.now() + FOLLOW_PAUSE_MS;
  };

  return (
    <div ref={ref} class="viewport unsynced follow" onWheel={pause} onPointerDown={pause}>
      <p class="notice">{notice}</p>
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
  durationMs,
  unsyncedNotice,
}: {
  lyrics: Lyrics;
  playback: Playback;
  /** Length of what's playing (ms), for the follow-along view. */
  durationMs?: number;
  /** Show as plain text with this notice even if timed (e.g. Shorts play a clip). */
  unsyncedNotice?: string;
}) {
  const mode = useSetting(scriptModeSetting);
  if (unsyncedNotice) {
    return <UnsyncedLyrics lyrics={lyrics} mode={mode} notice={unsyncedNotice} />;
  }
  const canFollow = Boolean(durationMs && durationMs > 0);
  if (lyrics.videoMismatch && canFollow) {
    return (
      <FollowLyrics
        lyrics={lyrics}
        mode={mode}
        playback={playback}
        durationMs={durationMs as number}
        notice="This video is a different cut of the song, so lyrics scroll along with it."
      />
    );
  }
  if (lyrics.sync === 'none') {
    return canFollow ? (
      <FollowLyrics
        lyrics={lyrics}
        mode={mode}
        playback={playback}
        durationMs={durationMs as number}
        notice="Lyrics scroll along with the song."
      />
    ) : (
      <UnsyncedLyrics lyrics={lyrics} mode={mode} notice="These lyrics aren't time-synced" />
    );
  }
  return <SyncedLyrics lyrics={lyrics} mode={mode} playback={playback} />;
}
