import type {
  CaptionCue,
  CaptionData,
  CaptionTrackInfo,
  CaptionWord,
  CapturedCaptions,
} from './protocol';

interface Json3 {
  events?: {
    tStartMs?: number;
    dDurationMs?: number;
    segs?: { utf8?: string; tOffsetMs?: number }[];
  }[];
}

/**
 * Sound descriptions in square brackets, in any language: "[Music]",
 * "[संगीत]", "[गाना गाने की आवाज़]", "[Applause]".
 */
const BRACKETED = /\[[^\]]*\]/g;
const NOISE =
  /^\s*[(（【]?\s*(music|applause|laughter|instrumental|♪+|音楽|संगीत|সঙ্গীত)\s*[)）】]?\s*$/i;

function cleanCaption(text: string): string {
  return (
    text
      .replace(BRACKETED, ' ')
      // ">>" marks a change of speaker in YouTube captions.
      .replace(/(?:>|&gt;){2,}/g, ' ')
      .replace(/[♪♫🎵🎶]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** A caption line this short that follows the previous one closely belongs to it. */
const FRAGMENT_WORDS = 2;
const FRAGMENT_GAP_MS = 900;
const MAX_LINE_WORDS = 10;
/** How long the last word of a line is assumed to last when the next line is far off. */
const LAST_WORD_MS = 700;

/**
 * Auto-generated captions → lyric lines timed from YouTube's own per-word
 * timestamps (each line starts when its first word is spoken, not when the
 * caption box appears). Stray one- or two-word fragments join the line before.
 */
export function parseAsrLines(json: Json3): CaptionCue[] {
  const lines: { words: { text: string; start: number }[] }[] = [];
  for (const event of json.events ?? []) {
    const base = event.tStartMs ?? 0;
    const words = (event.segs ?? [])
      .map((seg) => ({ text: cleanCaption(seg.utf8 ?? ''), start: base + (seg.tOffsetMs ?? 0) }))
      .filter((w) => w.text && !NOISE.test(w.text));
    if (words.length === 0) continue;
    const prev = lines[lines.length - 1];
    const prevLast = prev?.words[prev.words.length - 1];
    const isFragment =
      prev &&
      prevLast &&
      words.length <= FRAGMENT_WORDS &&
      (words[0]?.start ?? 0) - prevLast.start < FRAGMENT_GAP_MS &&
      prev.words.length + words.length <= MAX_LINE_WORDS;
    if (isFragment) prev.words.push(...words);
    else lines.push({ words });
  }

  return lines.map((line, i) => {
    const nextStart = lines[i + 1]?.words[0]?.start;
    const lastStart = line.words[line.words.length - 1]?.start ?? 0;
    const end = Math.min(nextStart ?? Number.POSITIVE_INFINITY, lastStart + LAST_WORD_MS * 3);
    const words = line.words.map((w, wi) => {
      const next = line.words[wi + 1];
      const wordEnd = next ? next.start : Math.min(end, w.start + LAST_WORD_MS);
      const text = wi < line.words.length - 1 ? `${w.text} ` : w.text;
      return { text, start: w.start, end: Math.max(w.start, wordEnd) };
    });
    return {
      start: words[0]?.start ?? 0,
      end: Math.max(words[0]?.start ?? 0, end),
      text: words.map((w) => w.text).join(''),
      words,
    };
  });
}

/** Caption events → timed lines (drops [Music]-style markers and empty cues). */
export function parseCueTrack(json: Json3): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const event of json.events ?? []) {
    const text = cleanCaption((event.segs ?? []).map((s) => s.utf8 ?? '').join(''));
    if (!text || NOISE.test(text)) continue;
    const start = event.tStartMs ?? 0;
    cues.push({ start, end: start + (event.dDurationMs ?? 0), text });
  }
  return cues;
}

/** Auto-generated captions → individual words with start times. */
export function parseAsrTrack(json: Json3): CaptionWord[] {
  const words: CaptionWord[] = [];
  for (const event of json.events ?? []) {
    const base = event.tStartMs ?? 0;
    for (const seg of event.segs ?? []) {
      const text = cleanCaption(seg.utf8 ?? '');
      if (!text || NOISE.test(text)) continue;
      words.push({ start: base + (seg.tOffsetMs ?? 0), text });
    }
  }
  return words;
}

async function fetchJson3(track: CaptionTrackInfo): Promise<Json3 | null> {
  try {
    const url = new URL(track.baseUrl, location.origin);
    url.searchParams.set('fmt', 'json3');
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return null;
    const body = await res.text();
    return body ? (JSON.parse(body) as Json3) : null;
  } catch {
    return null;
  }
}

const MIN_CUES = 4;
const MIN_WORDS = 10;

function build(
  manual: { language: string; json: Json3 } | null,
  asr: { language: string; json: Json3 } | null,
): CaptionData | null {
  const data: CaptionData = {};
  const cues = manual ? parseCueTrack(manual.json) : [];
  if (manual && cues.length >= MIN_CUES) data.manual = { language: manual.language, cues };
  const words = asr ? parseAsrTrack(asr.json) : [];
  if (asr && words.length >= MIN_WORDS) {
    // Lines too, so auto-captions can stand in for lyrics when nothing else has them.
    data.asr = { language: asr.language, words, cues: parseAsrLines(asr.json) };
  }
  return data.manual || data.asr ? data : null;
}

/** Fetches the uploader's captions and the auto-generated ones (best effort). */
export async function fetchCaptions(tracks: CaptionTrackInfo[]): Promise<CaptionData | null> {
  const manualTrack = tracks.find((t) => t.kind !== 'asr');
  const asrTrack = tracks.find((t) => t.kind === 'asr');
  const [manualJson, asrJson] = await Promise.all([
    manualTrack ? fetchJson3(manualTrack) : null,
    asrTrack ? fetchJson3(asrTrack) : null,
  ]);
  return build(
    manualTrack && manualJson ? { language: manualTrack.languageCode, json: manualJson } : null,
    asrTrack && asrJson ? { language: asrTrack.languageCode, json: asrJson } : null,
  );
}

/** Captions the player downloaded (raw json3) → cues and words. */
export function toCaptionData(raw: CapturedCaptions): CaptionData | null {
  return build(
    raw.manual ? { language: raw.manual.language, json: raw.manual.json as Json3 } : null,
    raw.asr ? { language: raw.asr.language, json: raw.asr.json as Json3 } : null,
  );
}

const sliceCues = (cues: CaptionCue[], startMs: number, endMs: number) =>
  cues
    .filter((c) => c.start >= startMs - 500 && c.start < endMs)
    .map((c) => ({
      ...c,
      start: c.start - startMs,
      end: c.end - startMs,
      words: c.words?.map((w) => ({ ...w, start: w.start - startMs, end: w.end - startMs })),
    }));

/** The part of a video's captions between two times, re-timed to start at 0. */
export function sliceCaptions(
  data: CaptionData,
  startMs: number,
  endMs: number,
): CaptionData | null {
  const sliced: CaptionData = {};
  const cues = data.manual ? sliceCues(data.manual.cues, startMs, endMs) : [];
  if (data.manual && cues.length >= MIN_CUES) sliced.manual = { ...data.manual, cues };
  const words = data.asr?.words
    .filter((w) => w.start >= startMs - 500 && w.start < endMs)
    .map((w) => ({ ...w, start: w.start - startMs }));
  if (data.asr && words && words.length >= MIN_WORDS) {
    sliced.asr = {
      ...data.asr,
      words,
      cues: data.asr.cues ? sliceCues(data.asr.cues, startMs, endMs) : undefined,
    };
  }
  return sliced.manual || sliced.asr ? sliced : null;
}
