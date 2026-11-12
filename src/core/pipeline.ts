import { canRomanize, lyricsScript, romanizeLine } from './lang/romanize';
import { autoSync, estimateOffset, shiftLines } from './lyrics/align';
import { parseLrc, parsePlain } from './lyrics/lrc';
import { attachRomanized, matchTwin } from './lyrics/romanized-twin';
import type {
  LyricLine,
  Lyrics,
  LyricsResult,
  LyricsSource,
  TrackInfo,
  VideoDetails,
} from './lyrics/types';
import { bestScore, type MatchCandidate, type MatchQuery } from './match/score';
import { artistSimilarity, normalize } from './match/similarity';
import { withRetry } from './net';
import { type LrclibRecord, lrclibGet, lrclibSearch } from './providers/lrclib';
import { lyricsOvh } from './providers/lyrics-ovh';
import { neteaseLyrics, neteaseSearch } from './providers/netease';
import { type FetchFn, searchItunes } from './resolve/itunes';
import { channelArtist, parseVideoTitle, type TitleGuess } from './resolve/title-parser';

/** iTunes hit must be at least this confident to be trusted as the canonical track. */
export const CANONICAL_THRESHOLD = 0.72;
/** Lyrics below this confidence are not shown — wrong lyrics are worse than none. */
export const ACCEPT_THRESHOLD = 0.62;
/** An exact LRCLIB hit this good (synced, Latin) skips the other sources. */
const SHORT_CIRCUIT = 0.9;
/** Uploads scoring within this of the best are treated as the same song. */
const SAME_SONG_MARGIN = 0.1;
/** How many NetEase search hits we fetch lyrics for. */
const NETEASE_LYRIC_FETCHES = 3;

export interface PipelineDeps {
  fetch: FetchFn;
  log?: (...args: unknown[]) => void;
}

/** One upload of a song's lyrics from any provider. */
interface Candidate extends MatchCandidate {
  id: string;
  provider: LyricsSource;
  instrumental?: boolean;
  lrc?: string;
  plain?: string;
  /** Provider's own romanized LRC, timed like `lrc` (NetEase). */
  romanizedSynced?: string;
}

interface Scored {
  candidate: Candidate;
  score: number;
}

/**
 * YouTube's own song identification goes first — but only if it plausibly belongs to
 * this video (the description card can briefly show the previous video's song).
 */
export function withMusicCard(video: VideoDetails, guesses: TitleGuess[]): TitleGuess[] {
  const music = video.music;
  if (!music?.title || !music.artist) return guesses;
  const videoTitle = normalize(video.title);
  const trusted =
    video.site === 'ytmusic' ||
    video.site === 'other' ||
    (normalize(music.title).length > 0 && videoTitle.includes(normalize(music.title))) ||
    (normalize(music.artist).length > 0 && videoTitle.includes(normalize(music.artist))) ||
    artistSimilarity(music.artist, channelArtist(video.author)) >= 0.7;
  if (!trusted) return guesses;
  return [{ artist: music.artist, title: music.title }, ...guesses];
}

function fromLrclib(r: LrclibRecord): Candidate {
  return {
    id: `lrclib:${r.id}`,
    provider: 'lrclib',
    artist: r.artistName,
    title: r.trackName,
    album: r.albumName ?? undefined,
    durationSec: r.duration ?? undefined,
    lrc: r.syncedLyrics ?? undefined,
    plain: r.plainLyrics ?? undefined,
    instrumental: r.instrumental,
  };
}

function toQuery(g: TitleGuess, video: VideoDetails): MatchQuery {
  return {
    artist: [g.artist, ...(g.featured ?? [])].filter(Boolean).join(', '),
    title: g.title,
    durationSec: video.lengthSec || undefined,
    durationKind: video.site === 'other' || video.site === 'ytmusic' ? 'tight' : 'loose',
  };
}

async function settle<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p;
  } catch {
    return undefined;
  }
}

function candidateLyrics(c: Candidate, durationMs?: number): Lyrics | undefined {
  if (c.lrc) {
    const lines = parseLrc(c.lrc, durationMs);
    if (lines.length) {
      const sync = lines.some((l) => l.words?.length) ? 'word' : 'line';
      return { sync, lines, source: c.provider, sourceId: c.id };
    }
  }
  if (c.plain) {
    const lines = parsePlain(c.plain);
    if (lines.length) return { sync: 'none', lines, source: c.provider, sourceId: c.id };
  }
  return undefined;
}

/** Adds Latin-letter versions of non-Latin lyrics, preferring a romanized upload. */
function romanize(
  primary: Lyrics,
  primaryCandidate: Candidate | undefined,
  sameSong: Scored[],
  durationMs?: number,
): Lyrics {
  const script = lyricsScript(primary.lines);
  if (script === 'latin' || script === 'none') return { ...primary, script };

  for (const { candidate } of sameSong) {
    const other = candidateLyrics(candidate, durationMs);
    if (!other || other.sync === 'none' || lyricsScript(other.lines) !== 'latin') continue;
    const match = matchTwin(primary.lines, other.lines);
    if (match === 'aligned') {
      return {
        ...primary,
        script,
        romanization: 'provider',
        lines: attachRomanized(primary.lines, other.lines),
      };
    }
    if (match === 'text' && primary.sync !== 'none') {
      // Same words, different timing: use the romanized upload as the lyrics.
      return { ...other, script: 'latin', romanization: 'provider' };
    }
  }

  if (canRomanize(script)) {
    return {
      ...primary,
      script,
      romanization: 'generated',
      lines: primary.lines.map((l) => ({ ...l, romanized: romanizeLine(l.text) })),
    };
  }

  // Japanese: use the provider's romaji (NetEase) when we can't generate it.
  if (primaryCandidate?.romanizedSynced && primary.sync !== 'none') {
    const roma = shiftLines(
      parseLrc(primaryCandidate.romanizedSynced, durationMs),
      primary.offsetMs ?? 0,
    );
    if (roma.length) {
      return {
        ...primary,
        script,
        romanization: 'provider',
        lines: attachRomanized(primary.lines, roma),
      };
    }
  }
  return { ...primary, script, romanization: 'none' };
}

/** Uploader captions on the video itself, used when no lyrics source has the song. */
function captionsLyrics(video: VideoDetails): Lyrics | undefined {
  const cues = video.captions?.manual?.cues;
  if (!cues || cues.length < 4) return undefined;
  const lines: LyricLine[] = cues.map((c) => ({ start: c.start, end: c.end, text: c.text }));
  return { sync: 'line', lines, source: 'youtube-captions', sourceId: video.videoId };
}

/** Resolves what's playing to its best-matching lyrics. Never throws. */
export async function findLyrics(
  video: VideoDetails,
  { fetch: rawFetch, log = () => {} }: PipelineDeps,
): Promise<LyricsResult> {
  const deps = { fetch: withRetry(rawFetch) };
  const guesses = withMusicCard(video, parseVideoTitle(video.title, video.author));
  const first = guesses[0];
  if (!first) return { status: 'not-found', query: { artist: video.author, title: video.title } };

  const videoQueries = guesses.map((g) => toQuery(g, video));
  const firstTerm = `${first.artist} ${first.title}`.trim();

  // 1. Canonicalize with iTunes (clean names, real track length, artwork).
  let canonical: TrackInfo | undefined;
  const terms = [...new Set([firstTerm, guesses.find((g) => !g.artist)?.title ?? first.title])];
  const itunes = (await Promise.all(terms.map((t) => settle(searchItunes(t, deps.fetch))))).flatMap(
    (r) => r ?? [],
  );
  let canonicalScore = 0;
  for (const t of itunes) {
    const s = bestScore(videoQueries, { ...t, synced: true });
    if (s > canonicalScore) {
      canonicalScore = s;
      canonical = t;
    }
  }
  if (canonicalScore < CANONICAL_THRESHOLD) canonical = undefined;
  log('itunes', canonical?.artist, '—', canonical?.title, canonicalScore.toFixed(2));

  const queries: MatchQuery[] = canonical
    ? [{ ...canonical, durationKind: 'tight' }, ...videoQueries]
    : videoQueries;
  const searchTerm = canonical ? `${canonical.artist} ${canonical.title}` : firstTerm;

  // 2. Gather candidates from every provider.
  const candidates = new Map<string, Candidate>();
  const add = (list: (Candidate | undefined)[]) => {
    for (const c of list) if (c) candidates.set(c.id, c);
  };
  const ranked = (): Scored[] =>
    [...candidates.values()]
      .map((candidate) => ({
        candidate,
        score: bestScore(queries, { ...candidate, synced: Boolean(candidate.lrc) }),
      }))
      .sort((a, b) => b.score - a.score);

  if (canonical?.durationSec) {
    const hit = await settle(
      lrclibGet({ ...canonical, durationSec: canonical.durationSec }, deps.fetch),
    );
    if (hit) add([fromLrclib(hit)]);
  }

  const exact = ranked()[0];
  const exactGood =
    exact &&
    exact.score >= SHORT_CIRCUIT &&
    exact.candidate.lrc &&
    lyricsScript(candidateLyrics(exact.candidate)?.lines ?? []) === 'latin';

  if (!exactGood) {
    const lrclib: Promise<LrclibRecord[] | undefined>[] = [];
    if (canonical) {
      lrclib.push(
        settle(lrclibSearch({ title: canonical.title, artist: canonical.artist }, deps.fetch)),
      );
    }
    for (const g of guesses.slice(0, 2)) {
      lrclib.push(
        settle(lrclibSearch({ title: g.title, artist: g.artist || undefined }, deps.fetch)),
      );
    }
    lrclib.push(settle(lrclibSearch({ q: searchTerm }, deps.fetch)));
    if (searchTerm !== firstTerm) lrclib.push(settle(lrclibSearch({ q: firstTerm }, deps.fetch)));

    const netease = (async () => {
      const songs = (
        await Promise.all(
          [...new Set([searchTerm, firstTerm])].map((t) => settle(neteaseSearch(t, deps.fetch))),
        )
      ).flatMap((r) => r ?? []);
      const unique = [...new Map(songs.map((s) => [s.id, s])).values()];
      const top = unique
        .map((s) => ({ s, score: bestScore(queries, { ...s, synced: true }) }))
        .filter((x) => x.score >= ACCEPT_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, NETEASE_LYRIC_FETCHES);
      return Promise.all(
        top.map(async ({ s }): Promise<Candidate | undefined> => {
          const lyrics = await settle(neteaseLyrics(s.id, deps.fetch));
          if (!lyrics?.synced) return undefined;
          return {
            id: `netease:${s.id}`,
            provider: 'netease',
            artist: s.artist,
            title: s.title,
            album: s.album,
            durationSec: s.durationSec,
            lrc: lyrics.synced,
            romanizedSynced: lyrics.romanized,
          };
        }),
      );
    })();

    const [lrclibLists, neteaseCandidates] = await Promise.all([Promise.all(lrclib), netease]);
    for (const list of lrclibLists) add((list ?? []).map(fromLrclib));
    add(neteaseCandidates);
  }

  const all = ranked().filter((s) => s.candidate.instrumental || candidateLyrics(s.candidate));
  const best = all[0];
  log(
    'candidates',
    all.slice(0, 5).map((s) => `${s.candidate.id} ${s.score.toFixed(2)}`),
  );

  const track: TrackInfo = canonical ?? {
    artist: best?.candidate.artist ?? first.artist,
    title: best?.candidate.title ?? first.title,
    album: best?.candidate.album,
    durationSec: best?.candidate.durationSec,
  };

  // 3. Pick: the best synced upload among same-song candidates, else the best overall.
  let chosen: Scored | undefined;
  if (best && best.score >= ACCEPT_THRESHOLD) {
    const sameSong = all.filter((s) => s.score >= best.score - SAME_SONG_MARGIN);
    chosen = sameSong.find((s) => s.candidate.lrc) ?? best;
    if (chosen.candidate.instrumental) return { status: 'instrumental', track };
  }

  const durationMs =
    (chosen?.candidate.durationSec ?? canonical?.durationSec ?? video.lengthSec ?? 0) * 1000 ||
    undefined;
  let lyrics = chosen ? candidateLyrics(chosen.candidate, durationMs) : undefined;

  // 4. Fallbacks: the video's own captions, then plain lyrics from the web.
  if (!lyrics) lyrics = captionsLyrics(video);
  if (!lyrics && canonical) {
    const plain = await settle(lyricsOvh(canonical.artist, canonical.title, deps.fetch));
    if (plain) lyrics = { sync: 'none', lines: parsePlain(plain), source: 'lyrics.ovh' };
  }
  if (!lyrics?.lines.length) {
    const query = canonical ?? first;
    return { status: 'not-found', query: { artist: query.artist, title: query.title } };
  }

  // 5. English letters for non-Latin scripts (before any re-timing, so twins still align).
  const sameSong =
    chosen && best
      ? all.filter((s) => s !== chosen && s.score >= best.score - SAME_SONG_MARGIN)
      : [];
  lyrics = romanize(lyrics, chosen?.candidate, sameSong, durationMs);

  // 6. Timing against this video's speech-recognition captions.
  const asr = video.captions?.asr?.words;
  if (asr?.length && lyrics.source !== 'youtube-captions') {
    if (lyrics.sync === 'none') {
      const timed = autoSync(lyrics.lines, asr, durationMs);
      if (timed) lyrics = { ...lyrics, sync: 'line', lines: timed, autoSynced: true };
    } else {
      const offset = estimateOffset(lyrics.lines, asr);
      if (offset) lyrics = { ...lyrics, lines: shiftLines(lyrics.lines, offset), offsetMs: offset };
    }
  }

  log(
    'lyrics',
    lyrics.source,
    lyrics.sync,
    lyrics.script,
    lyrics.romanization,
    lyrics.offsetMs ?? 0,
  );

  const confidence = chosen ? Math.min(1, chosen.score) : 0.5;
  return { status: 'found', track, lyrics, confidence };
}
