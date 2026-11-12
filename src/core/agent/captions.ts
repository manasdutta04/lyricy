import type { CaptionCue, CaptionData, CaptionTrackInfo, CaptionWord } from './protocol';

interface Json3 {
  events?: {
    tStartMs?: number;
    dDurationMs?: number;
    segs?: { utf8?: string; tOffsetMs?: number }[];
  }[];
}

const NOISE =
  /^\s*[[(（【]?\s*(music|applause|laughter|instrumental|♪+|音楽|संगीत)\s*[\])）】]?\s*$/i;

function cleanCaption(text: string): string {
  return text
    .replace(/[♪♫🎵🎶]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Uploader captions → timed lines (drops [Music] markers and empty cues). */
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
      const text = (seg.utf8 ?? '').trim();
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

/** Fetches the uploader's captions and the auto-generated ones (best effort). */
export async function fetchCaptions(tracks: CaptionTrackInfo[]): Promise<CaptionData | null> {
  const manualTrack = tracks.find((t) => t.kind !== 'asr');
  const asrTrack = tracks.find((t) => t.kind === 'asr');
  const [manualJson, asrJson] = await Promise.all([
    manualTrack ? fetchJson3(manualTrack) : null,
    asrTrack ? fetchJson3(asrTrack) : null,
  ]);
  const data: CaptionData = {};
  const cues = manualJson ? parseCueTrack(manualJson) : [];
  if (manualTrack && cues.length >= 4) data.manual = { language: manualTrack.languageCode, cues };
  const words = asrJson ? parseAsrTrack(asrJson) : [];
  if (asrTrack && words.length >= 10) data.asr = { language: asrTrack.languageCode, words };
  return data.manual || data.asr ? data : null;
}
