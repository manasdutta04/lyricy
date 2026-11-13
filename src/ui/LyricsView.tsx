import { type ComponentChildren, Fragment } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Script } from '@/core/lang/script';
import type { LyricLine, Lyrics } from '@/core/lyrics/types';
import { buildDisplayItems, progress } from '@/core/lyrics/word-timing';
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
  gujarati: 'gu',
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

/** The text shown as the main line in the current script mode. */
function mainText(line: LyricLine, mode: ScriptMode): string {
  const romanized = line.romanized && line.romanized !== line.text ? line.romanized : undefined;
  return mode === 'original' || !romanized ? line.text : romanized;
}

/** Held notes (long words) get Apple's soft glow while they're sung. */
const HELD_MS = 900;

function SyncedLyrics({ lyrics, mode, playback }: ViewProps & { playback: Playback }) {
  const items = useMemo(
    () => buildDisplayItems(lyrics.lines, (line) => mainText(line, mode)),
    [lyrics, mode],
  );
  const [active, setActive] = useState(-1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const [layout, setLayout] = useState<Layout>({ tops: [], viewport: 0 });
  const [manual, setManual] = useState(0);
  const [browsing, setBrowsing] = useState(false);
  const idleTimer = useRef<number | undefined>(undefined);
  const lang = lyrics.script ? LANG_BY_SCRIPT[lyrics.script] : undefined;

  // One animation loop: which line is active, and how far each of its words is sung.
  // It runs on the window that shows the lyrics (the side panel or the floating window).
  useEffect(() => {
    const win = viewportRef.current?.ownerDocument.defaultView ?? window;
    let current = Number.NaN;
    let frame = 0;
    const tick = () => {
      const t = playback.now() + LEAD_MS;
      const index = findActiveIndex(items, t);
      if (index !== current) {
        current = index;
        setActive(index);
      }
      const item = items[index];
      const el = itemRefs.current[index];
      if (item && el) {
        if (item.kind === 'gap') {
          el.style.setProperty('--p', String(progress(t, item.start, item.end)));
        } else {
          const spans = el.querySelectorAll<HTMLElement>('.w');
          item.words.forEach((w, i) => {
            const span = spans[i];
            if (!span) return;
            const p = progress(t, w.start, w.end);
            span.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
            span.classList.toggle('held', w.end - w.start >= HELD_MS && p > 0 && p < 1);
          });
        }
      }
      frame = win.requestAnimationFrame(tick);
    };
    tick();
    return () => win.cancelAnimationFrame(frame);
  }, [items, playback]);

  // Measure item positions (offsetTop ignores transforms) whenever size or fonts change.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return;
    const win = viewport.ownerDocument.defaultView ?? window;
    const measure = () =>
      setLayout({
        tops: itemRefs.current.slice(0, items.length).map((el) => el?.offsetTop ?? 0),
        viewport: viewport.clientHeight,
      });
    measure();
    const observer = new win.ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(list);
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const anchorTop = layout.tops[Math.max(0, active)] ?? 0;
  const lastTop = layout.tops[layout.tops.length - 1] ?? 0;
  const firstTop = layout.tops[0] ?? 0;
  const translate = layout.viewport * ANCHOR - anchorTop + manual;

  const stopBrowsing = () => {
    clearTimeout(idleTimer.current);
    setManual(0);
    setBrowsing(false);
  };

  const onWheel = (event: WheelEvent) => {
    const maxUp = anchorTop - firstTop;
    const maxDown = lastTop - anchorTop;
    const next = Math.min(maxUp, Math.max(-maxDown, manual - event.deltaY));
    if (next === manual) return;
    event.preventDefault();
    setManual(next);
    setBrowsing(true);
    clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(stopBrowsing, BROWSE_IDLE_MS);
  };

  const styleFor = (index: number) => {
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
        {items.map((item, i) => {
          const distance = Math.min(Math.abs(i - active), 4);
          const state = i === active ? 'active' : i < active ? 'past' : 'future';
          const ref = (el: HTMLElement | null) => {
            itemRefs.current[i] = el;
          };
          if (item.kind === 'gap') {
            return (
              <div
                key={`gap-${item.start}`}
                ref={ref}
                class={`line gap ${state} d${distance}`}
                style={styleFor(i)}
                aria-hidden="true"
              >
                <span class="dot" />
                <span class="dot" />
                <span class="dot" />
              </div>
            );
          }
          const line = lyrics.lines[item.index] as LyricLine;
          const romanized = line.romanized && line.romanized !== line.text;
          const showsRomanized = mode !== 'original' && romanized;
          return (
            <button
              type="button"
              key={`${line.start}-${item.index}`}
              ref={ref}
              class={`line ${state} d${distance}`}
              style={styleFor(i)}
              onClick={() => {
                stopBrowsing();
                playback.seek(line.start);
              }}
            >
              <span class="main" lang={showsRomanized && lang ? `${lang}-Latn` : lang}>
                {item.words.map((w, wi) => (
                  <Fragment key={wi}>
                    <span class="w">{w.text.trimEnd()}</span>
                    {/s$/.test(w.text) ? ' ' : ''}
                  </Fragment>
                ))}
              </span>
              {mode === 'both' && romanized && (
                <span class="sub" lang={lang}>
                  {line.text}
                </span>
              )}
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
