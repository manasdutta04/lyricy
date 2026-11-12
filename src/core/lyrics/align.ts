import type { CaptionWord } from '../agent/protocol';
import { romanizeLine } from '../lang/romanize';
import type { LyricLine } from './types';

/**
 * Aligns lyric lines to YouTube's auto-generated (speech-recognition) captions.
 * Used to (1) time lyrics that only exist as plain text and (2) detect the offset
 * between studio-timed lyrics and a music video with an intro.
 *
 * Words are compared by consonant skeleton after romanization, so Hindi ASR in
 * Devanagari still matches Hinglish lyrics ("तुम" ~ "tum" → "tm").
 */

const SEARCH_WINDOW = 80;
const MIN_LINE_SCORE = 0.5;

export function wordKey(word: string): string {
  const latin = romanizeLine(word)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z]/g, '');
  const skeleton = latin.replace(/[aeiouyw]/g, '').replace(/(.)\1+/g, '$1');
  return skeleton || latin;
}

const lineKeys = (text: string) => text.split(/\s+/).map(wordKey).filter(Boolean);

interface Keyed {
  t: number;
  k: string;
}

/** Start time (ms) for each line, or null where no confident match was found. */
export function alignLines(
  lines: readonly { text: string }[],
  words: readonly CaptionWord[],
): (number | null)[] {
  const asr: Keyed[] = words
    .flatMap((w) => w.text.split(/\s+/).map((part) => ({ t: w.start, k: wordKey(part) })))
    .filter((w) => w.k);
  const starts: (number | null)[] = [];
  let pointer = 0;

  for (const line of lines) {
    const keys = lineKeys(line.text);
    if (keys.length === 0 || pointer >= asr.length) {
      starts.push(null);
      continue;
    }
    let best: { s: number; score: number; first: number } | null = null;
    const end = Math.min(asr.length - 1, pointer + SEARCH_WINDOW);
    for (let s = pointer; s <= end; s++) {
      const window = asr.slice(s, s + keys.length + 2);
      const pool = window.map((w) => w.k);
      let hits = 0;
      let first = -1;
      for (const key of keys) {
        const at = pool.indexOf(key);
        if (at >= 0) {
          hits++;
          if (first < 0 || at < first) first = at;
          pool[at] = '';
        }
      }
      // Starting on the line's first word is a strong hint.
      const score = hits / keys.length + (window[0]?.k === keys[0] ? 0.15 : 0);
      if (!best || score > best.score) best = { s, score, first: Math.max(0, first) };
    }
    if (best && best.score >= MIN_LINE_SCORE) {
      starts.push(asr[best.s + best.first]?.t ?? asr[best.s]?.t ?? null);
      pointer = best.s + Math.max(1, Math.floor(keys.length * 0.6));
    } else {
      starts.push(null);
    }
  }
  return starts;
}

/**
 * Turns plain lyrics into timed lines using ASR captions. Returns null when too
 * few lines could be matched to trust the result.
 */
export function autoSync(
  lines: readonly LyricLine[],
  words: readonly CaptionWord[],
  durationMs?: number,
): LyricLine[] | null {
  const starts = alignLines(lines, words);
  const known = starts.filter((s) => s !== null).length;
  if (lines.length === 0 || known / lines.length < 0.35 || known < 3) return null;

  // Fill gaps by interpolating between matched neighbours (and keep order monotonic).
  const filled = [...starts];
  for (let i = 0; i < filled.length; i++) {
    if (filled[i] !== null) continue;
    let prev = i - 1;
    while (prev >= 0 && filled[prev] === null) prev--;
    let next = i + 1;
    while (next < filled.length && starts[next] === null) next++;
    const prevT = prev >= 0 ? (filled[prev] as number) : null;
    const nextT = next < filled.length ? (starts[next] as number) : null;
    if (prevT !== null && nextT !== null) {
      filled[i] = prevT + ((nextT - prevT) * (i - prev)) / (next - prev);
    } else if (nextT !== null) {
      filled[i] = Math.max(0, nextT - (next - i) * 2500);
    } else if (prevT !== null) {
      filled[i] = prevT + (i - prev) * 3000;
    }
  }
  for (let i = 1; i < filled.length; i++) {
    const prev = filled[i - 1] ?? 0;
    if ((filled[i] ?? 0) < prev) filled[i] = prev;
  }

  return lines.map((line, i) => {
    const start = Math.round(filled[i] as number);
    const nextStart = filled[i + 1];
    const end =
      nextStart !== undefined && nextStart !== null
        ? Math.round(nextStart)
        : Math.min(durationMs ?? start + 5000, start + 6000);
    return { ...line, start, end: Math.max(start, end) };
  });
}

/**
 * Offset (ms) to add to studio-timed lyrics so they match this video, or 0 when
 * the lyrics already line up / there isn't enough evidence.
 */
export function estimateOffset(lines: readonly LyricLine[], words: readonly CaptionWord[]): number {
  const starts = alignLines(lines, words);
  const deltas: number[] = [];
  starts.forEach((s, i) => {
    const line = lines[i];
    if (s !== null && line) deltas.push(s - line.start);
  });
  if (deltas.length < 6 || deltas.length / lines.length < 0.3) return 0;
  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)] ?? 0;
  const spread = deltas.map((d) => Math.abs(d - median)).sort((a, b) => a - b);
  const mad = spread[Math.floor(spread.length / 2)] ?? Number.POSITIVE_INFINITY;
  if (mad > 1500) return 0; // inconsistent: probably a different edit
  return Math.abs(median) >= 700 ? Math.round(median) : 0;
}

export function shiftLines(lines: readonly LyricLine[], offsetMs: number): LyricLine[] {
  if (!offsetMs) return [...lines];
  const shift = (t: number) => Math.max(0, t + offsetMs);
  return lines.map((l) => ({
    ...l,
    start: shift(l.start),
    end: shift(l.end),
    words: l.words?.map((w) => ({ ...w, start: shift(w.start), end: shift(w.end) })),
  }));
}
