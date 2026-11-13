import type { LyricLine } from './types';

/** A word as displayed (with its trailing space) and when it's sung. */
export interface TimedWord {
  text: string;
  start: number;
  end: number;
}

export type DisplayItem =
  | { kind: 'line'; index: number; start: number; end: number; words: TimedWord[] }
  /** Intro or instrumental break: Apple shows three breathing dots. */
  | { kind: 'gap'; start: number; end: number };

/** Roughly how long singing takes per character, for lines without word timing. */
const MS_PER_CHAR = 105;
const MIN_LINE_MS = 700;
/** A pause between lines longer than this shows the interlude dots. */
const GAP_MS = 4500;
/** The intro shows dots when the first line starts later than this. */
const LEAD_IN_MS = 2500;

/**
 * When each displayed word is sung. Uses the provider's word timing when the
 * displayed text is exactly what was timed; otherwise spreads the line's singing
 * time over its words by length (Apple-style fill for line-synced lyrics).
 */
export function timeWords(line: LyricLine, displayed: string): TimedWord[] {
  if (line.words?.length && displayed === line.text) {
    return line.words.map((w) => ({ text: w.text, start: w.start, end: w.end }));
  }
  const tokens = displayed.match(/\S+\s*/g) ?? [];
  if (tokens.length === 0) return [];
  // Sung words (or the same word count in another script): keep their timing.
  if (line.words?.length === tokens.length) {
    return tokens.map((text, i) => ({
      text,
      start: line.words?.[i]?.start ?? line.start,
      end: line.words?.[i]?.end ?? line.end,
    }));
  }
  const chars = tokens.reduce((n, t) => n + t.trim().length + 1, 0);
  const lineMs = Math.max(0, line.end - line.start);
  const singMs = Math.max(
    Math.min(lineMs * 0.95, chars * MS_PER_CHAR + 300),
    Math.min(MIN_LINE_MS, lineMs),
  );
  let t = line.start;
  return tokens.map((text) => {
    const share = ((text.trim().length + 1) / chars) * singMs;
    const word = { text, start: Math.round(t), end: Math.round(t + share) };
    t += share;
    return word;
  });
}

/** When a line's singing is done (its last word ends), as opposed to when the next line starts. */
export function singingEnd(words: TimedWord[], line: LyricLine): number {
  return words[words.length - 1]?.end ?? line.end;
}

/** Lines plus the intro / instrumental-break dots, in time order. */
export function buildDisplayItems(
  lines: readonly LyricLine[],
  displayed: (line: LyricLine) => string,
): DisplayItem[] {
  const items: DisplayItem[] = [];
  const first = lines[0];
  if (first && first.start > LEAD_IN_MS) items.push({ kind: 'gap', start: 0, end: first.start });

  lines.forEach((line, index) => {
    const words = timeWords(line, displayed(line));
    items.push({ kind: 'line', index, start: line.start, end: line.end, words });
    const next = lines[index + 1];
    if (!next) return;
    const done = singingEnd(words, line);
    if (next.start - done > GAP_MS) {
      items.push({ kind: 'gap', start: done + 400, end: next.start });
    }
  });
  return items;
}

/** 0..1 progress of `t` through [start, end]. */
export function progress(t: number, start: number, end: number): number {
  if (end <= start) return t >= start ? 1 : 0;
  return Math.min(1, Math.max(0, (t - start) / (end - start)));
}
