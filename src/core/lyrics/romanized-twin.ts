import { romanizeLine } from '../lang/romanize';
import type { LyricLine } from './types';

/**
 * LRCLIB often holds several uploads of one song: the native script (हिंदी) and a
 * romanized one ("Hinglish"). But a Latin-script upload can also be the *English
 * version* of the song (e.g. YOASOBI's "Idol"), which has different words than the
 * audio. These helpers tell a transliteration apart from a translation.
 */

// Common English words that are NOT also common Hinglish/romaji words
// (so no "to", "me", "main", "na", "so", "us", "hai"…).
const ENGLISH = new Set(
  (
    'the you i and my your it is that in of for on with this be all just what can know ' +
    "like love don't i'm it's we they she he her his was were will would could never " +
    'now when where why how there their them our out up down only want need baby girl ' +
    'boy night time heart feel see say said tell oh yeah every way away right wrong ' +
    'gonna wanna got get go come take make let been have had are am not no yes one'
  ).split(' '),
);

/** Share of words that are distinctly English (0..1). */
export function englishRatio(lines: readonly LyricLine[]): number {
  const words = lines.slice(0, 40).flatMap((l) => l.text.toLowerCase().match(/[a-z']+/g) ?? []);
  if (words.length === 0) return 0;
  return words.filter((w) => ENGLISH.has(w)).length / words.length;
}

/** Share of `a`'s lines that have a line in `b` starting within `toleranceMs`. */
export function timingAlignment(
  a: readonly LyricLine[],
  b: readonly LyricLine[],
  toleranceMs = 400,
): number {
  if (a.length === 0 || b.length === 0) return 0;
  let j = 0;
  let hits = 0;
  for (const line of a) {
    while (j < b.length - 1 && (b[j + 1]?.start ?? 0) <= line.start) j++;
    const near = [b[j], b[j + 1]].some((c) => c && Math.abs(c.start - line.start) <= toleranceMs);
    if (near) hits++;
  }
  return hits / a.length;
}

/** Consonant skeleton, so "bataaye"/"bataye"/"btae" all compare equal-ish. */
function skeleton(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z ]/g, '')
    .replace(/[aeiouyw]/g, '')
    .replace(/(.)\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigramDice(a: string, b: string): number {
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++)
      m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let overlap = 0;
  let total = 0;
  for (const n of ga.values()) total += n;
  for (const n of gb.values()) total += n;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return total ? (2 * overlap) / total : 0;
}

/** Does our own romanization of `native` read like `latin`? */
export function textResemblance(native: readonly LyricLine[], latin: readonly LyricLine[]): number {
  const n = skeleton(
    native
      .slice(0, 20)
      .map((l) => romanizeLine(l.text))
      .join(' '),
  );
  const l = skeleton(
    latin
      .slice(0, 20)
      .map((x) => x.text)
      .join(' '),
  );
  return bigramDice(n, l);
}

export type TwinMatch = 'aligned' | 'text' | null;

/** Is `latin` a romanization (not a translation) of `native`? */
export function matchTwin(native: readonly LyricLine[], latin: readonly LyricLine[]): TwinMatch {
  if (englishRatio(latin) > englishRatio(native) + 0.2) return null; // English version
  if (textResemblance(native, latin) < 0.35) return null;
  return timingAlignment(native, latin) >= 0.6 ? 'aligned' : 'text';
}

/** Copies each Latin line onto the native line that starts at the same moment. */
export function attachRomanized(native: LyricLine[], latin: readonly LyricLine[]): LyricLine[] {
  let j = 0;
  return native.map((line) => {
    while (j < latin.length - 1 && (latin[j + 1]?.start ?? 0) <= line.start + 200) j++;
    const candidate = latin[j];
    const romanized =
      candidate && Math.abs(candidate.start - line.start) <= 400
        ? candidate.text
        : romanizeLine(line.text);
    return { ...line, romanized };
  });
}
