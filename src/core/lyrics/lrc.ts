import type { LyricLine, Word } from './types';

const LEADING_TIME = /^\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/;
const WORD_TIME = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\s*\]$/i;

/** Fallback length for the final line when the song duration is unknown. */
const LAST_LINE_MS = 5000;

function toMs(min: string, sec: string): number {
  return Math.round((Number(min) * 60 + Number.parseFloat(sec.replace(':', '.'))) * 1000);
}

interface RawEntry {
  start: number;
  text: string;
  words?: Word[];
}

/** Parses Enhanced-LRC word stamps: `<00:12.30>Hello <00:12.80>world <00:13.40>` */
function parseWords(body: string): { text: string; words?: Word[] } {
  if (!body.includes('<')) return { text: body.trim() };

  const words: Word[] = [];
  const stamps = [...body.matchAll(WORD_TIME)];
  if (stamps.length === 0) return { text: body.trim() };

  stamps.forEach((match, i) => {
    const textStart = (match.index ?? 0) + match[0].length;
    const textEnd = stamps[i + 1]?.index ?? body.length;
    const text = body.slice(textStart, textEnd);
    const start = toMs(match[1] ?? '0', match[2] ?? '0');
    const prev = words[words.length - 1];
    if (prev) prev.end = start;
    if (text.trim()) words.push({ text, start, end: start });
  });

  const text = words
    .map((w) => w.text)
    .join('')
    .trim();
  return words.length ? { text, words } : { text };
}

/**
 * Parses LRC / Enhanced LRC into lines with start/end in ms.
 * - Multiple leading stamps (`[00:10.00][01:20.00]chorus`) expand into repeated lines.
 * - Blank timed lines end the previous line (they mark instrumental gaps).
 * - `[offset:±ms]` is applied (positive = lyrics appear earlier).
 */
export function parseLrc(text: string, durationMs?: number): LyricLine[] {
  let offset = 0;
  const entries: RawEntry[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const offsetMatch = line.match(OFFSET_TAG);
    if (offsetMatch) {
      offset = Number.parseInt(offsetMatch[1] ?? '0', 10);
      continue;
    }

    const starts: number[] = [];
    let rest = line;
    for (let m = rest.match(LEADING_TIME); m; m = rest.match(LEADING_TIME)) {
      starts.push(toMs(m[1] ?? '0', m[2] ?? '0'));
      rest = rest.slice(m[0].length);
    }
    if (starts.length === 0) continue; // metadata tag like [ar:...] or junk

    const { text: body, words } = parseWords(rest);
    for (const start of starts) {
      // Word stamps are absolute, so they only make sense for a single occurrence.
      entries.push({ start, text: body, words: starts.length === 1 ? words : undefined });
    }
  }

  entries.sort((a, b) => a.start - b.start);

  const lines: LyricLine[] = [];
  entries.forEach((entry, i) => {
    // Lines with no words ("♫♫♫", "...") mark instrumental gaps, not lyrics.
    if (!/[\p{L}\p{N}]/u.test(entry.text)) return;
    const start = Math.max(0, entry.start - offset);
    const next = entries[i + 1];
    let end: number;
    if (next) end = Math.max(start, next.start - offset);
    else if (durationMs && durationMs > start) end = Math.min(durationMs, start + LAST_LINE_MS * 2);
    else end = start + LAST_LINE_MS;

    const words = entry.words?.map((w, wi, all) => ({
      text: w.text,
      start: Math.max(0, w.start - offset),
      // Last word without a closing stamp runs to the end of the line.
      end: wi === all.length - 1 && w.end === w.start ? end : Math.max(0, w.end - offset),
    }));

    lines.push(words ? { start, end, text: entry.text, words } : { start, end, text: entry.text });
  });

  return lines;
}

/** Plain (unsynced) lyrics → lines without timing. */
export function parsePlain(text: string): LyricLine[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((t) => ({ start: 0, end: 0, text: t }));
}
