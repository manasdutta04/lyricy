import type { CaptionWord } from './agent/protocol';
import { canRomanize, lyricsScript, romanizeLine } from './lang/romanize';
import { hasNonLatin } from './lang/script';
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
import { jiosaavnLyrics, jiosaavnSearch } from './providers/jiosaavn';
import { type LrclibRecord, lrclibGet, lrclibSearch } from './providers/lrclib';
import { lyricsOvh } from './providers/lyrics-ovh';
import { neteaseLyrics, neteaseSearch } from './providers/netease';
import { type FetchFn, searchItunes } from './resolve/itunes';
import { channelArtist, parseVideoTitle, type TitleGuess } from './resolve/title-parser';

/** iTunes hit must be at least this confident to be trusted as the canonical track. */
export const CANONICAL_THRESHOLD = 0.72;
/** Below canonical but still useful as clean search terms. */
const HINT_THRESHOLD = 0.55;
/** Lyrics below this confidence are not shown — wrong lyrics are worse than none. */
export const ACCEPT_THRESHOLD = 0.62;
/** An exact LRCLIB hit this good (synced, Latin) skips the other sources. */
const SHORT_CIRCUIT = 0.9;
/** Uploads scoring within this of the best are treated as the same song. */
const SAME_SONG_MARGIN = 0.1;
/** How many NetEase search hits we fetch lyrics for. */
const NETEASE_LYRIC_FETCHES = 3;
/** Lyrics timed for a version this much longer/shorter than the video can't be trusted to sync. */
const VIDEO_MISMATCH_SEC = 10;

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
  if (script === 'latin' || script === 'none') {
    // Mostly English letters, but some lines may still mix in another script
    // ("Senti মারে, পালটি মারে"): convert just those.
    const mixed = primary.lines.some((l) => hasNonLatin(l.text));
    if (!mixed) return { ...primary, script };
    return {
      ...primary,
      script,
      romanization: 'generated',
      lines: primary.lines.map((l) =>
        hasNonLatin(l.text) ? { ...l, romanized: romanizeLine(l.text) } : l,
      ),
    };
  }

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

/**
 * Timed words to align lyrics against: speech recognition if available, else the
 * uploader's captions (each word placed across its caption's time span).
 */
function alignmentWords(video: VideoDetails): CaptionWord[] {
  const asr = video.captions?.asr?.words;
  if (asr?.length) return asr;
  const cues = video.captions?.manual?.cues ?? [];
  return cues.flatMap((cue) => {
    const parts = cue.text.split(/\s+/).filter(Boolean);
    const step = parts.length ? Math.max(0, cue.end - cue.start) / parts.length : 0;
    return parts.map((text, i) => ({ start: Math.round(cue.start + i * step), text }));
  });
}

/** Uploader captions on the video itself, used when no lyrics source has the song. */
function captionsLyrics(video: VideoDetails): Lyrics | undefined {
  const manual = video.captions?.manual?.cues;
  const auto = video.captions?.asr?.cues;
  // Prefer the uploader's captions; fall back to YouTube's auto-generated ones.
  const cues = manual && manual.length >= 4 ? manual : auto && auto.length >= 4 ? auto : null;
  if (!cues) return undefined;
  const lines: LyricLine[] = cues.map((c) => ({ start: c.start, end: c.end, text: c.text }));
  return {
    sync: 'line',
    lines,
    source: 'youtube-captions',
    sourceId: video.videoId,
    autoCaptions: cues !== manual,
  };
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
  const named = guesses.find((g) => g.artist && g !== first);
  const namedTerm = named ? `${named.artist} ${named.title}` : undefined;
  const terms = [
    ...new Set(
      [firstTerm, namedTerm, guesses.find((g) => !g.artist)?.title ?? first.title].filter(
        (t): t is string => Boolean(t),
      ),
    ),
  ].slice(0, 3);
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
  // A near-miss is still a good *search hint* (clean names), just not trusted for scoring.
  const hint = canonical && canonicalScore >= HINT_THRESHOLD ? canonical : undefined;
  if (canonicalScore < CANONICAL_THRESHOLD) canonical = undefined;
  log(
    'itunes',
    hint?.artist,
    '—',
    hint?.title,
    canonicalScore.toFixed(2),
    canonical ? 'trusted' : 'hint',
  );

  const queries: MatchQuery[] = canonical
    ? [{ ...canonical, durationKind: 'tight' }, ...videoQueries]
    : videoQueries;
  // An upload timed to this exact YouTube cut is as good a match as the album track.
  if (canonical && video.site === 'youtube' && video.lengthSec > 0) {
    queries.push({ ...canonical, durationSec: video.lengthSec, durationKind: 'tight' });
  }
  const hintTerm = hint ? `${hint.artist} ${hint.title}` : undefined;
  const searchTerms = [
    ...new Set([hintTerm, firstTerm, namedTerm].filter((t): t is string => Boolean(t))),
  ];

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
    if (hint) {
      lrclib.push(settle(lrclibSearch({ title: hint.title, artist: hint.artist }, deps.fetch)));
    }
    for (const g of guesses.slice(0, 3)) {
      lrclib.push(
        settle(lrclibSearch({ title: g.title, artist: g.artist || undefined }, deps.fetch)),
      );
    }
    for (const term of searchTerms) lrclib.push(settle(lrclibSearch({ q: term }, deps.fetch)));

    const netease = (async () => {
      const songs = (
        await Promise.all(searchTerms.map((t) => settle(neteaseSearch(t, deps.fetch))))
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
    const synced = sameSong.filter((s) => s.candidate.lrc);
    // On YouTube, prefer the upload timed to this exact cut of the song (many LRCLIB
    // entries were synced to the YouTube video, not the album track).
    if (video.site === 'youtube' && video.lengthSec > 0) {
      const gap = (s: Scored) =>
        Math.abs((s.candidate.durationSec ?? Number.POSITIVE_INFINITY) - video.lengthSec);
      synced.sort((a, b) => gap(a) - gap(b) || b.score - a.score);
    }
    chosen = synced[0] ?? best;
    if (chosen.candidate.instrumental) return { status: 'instrumental', track };
  }

  const durationMs =
    (chosen?.candidate.durationSec ?? canonical?.durationSec ?? video.lengthSec ?? 0) * 1000 ||
    undefined;
  let lyrics = chosen ? candidateLyrics(chosen.candidate, durationMs) : undefined;

  // 4. Fallbacks: the video's own captions, then plain lyrics from the web.
  if (!lyrics) lyrics = captionsLyrics(video);
  const plainSource = canonical ?? hint;
  if (!lyrics) {
    // JioSaavn has (Hinglish) lyrics for many Indian releases.
    const term = plainSource ? `${plainSource.title} ${plainSource.artist}` : firstTerm;
    const hits = (await settle(jiosaavnSearch(term, deps.fetch))) ?? [];
    const match = hits
      .map((h) => ({ h, score: bestScore(queries, { ...h, synced: true }) }))
      .filter((x) => x.score >= ACCEPT_THRESHOLD)
      .sort((a, b) => b.score - a.score)[0];
    const plain = match && (await settle(jiosaavnLyrics(match.h.id, deps.fetch)));
    if (plain) lyrics = { sync: 'none', lines: parsePlain(plain), source: 'jiosaavn' };
  }
  if (!lyrics && plainSource) {
    const plain = await settle(lyricsOvh(plainSource.artist, plainSource.title, deps.fetch));
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

  // 6. Timing against this video. Lyrics sources are timed to the album track;
  //    YouTube captions (speech recognition, or the uploader's own) tell us when
  //    each line is actually sung in *this* video.
  const words = alignmentWords(video);
  let mismatch: Lyrics['videoMismatch'];
  if (video.site === 'youtube' && video.lengthSec > 0 && lyrics.sync !== 'none') {
    const lastEnd = (lyrics.lines[lyrics.lines.length - 1]?.end ?? 0) / 1000;
    const lyricsSec = chosen?.candidate.durationSec ?? lastEnd;
    if (Math.abs(lyricsSec - video.lengthSec) > VIDEO_MISMATCH_SEC) {
      mismatch = { videoSec: video.lengthSec, lyricsSec };
    }
  }
  if (words.length && lyrics.source !== 'youtube-captions') {
    if (lyrics.sync === 'none' || mismatch) {
      // Plain lyrics, or lyrics timed for a different cut: re-time every line.
      const timed = autoSync(lyrics.lines, words, (video.lengthSec || 0) * 1000 || durationMs);
      if (timed) {
        lyrics = { ...lyrics, sync: 'line', lines: timed, autoSynced: true };
        mismatch = undefined;
      }
    } else {
      const offset = estimateOffset(lyrics.lines, words);
      if (offset) lyrics = { ...lyrics, lines: shiftLines(lyrics.lines, offset), offsetMs: offset };
    }
  }

  // 7. Still timed for a different cut? Then show the lyrics without sync rather
  //    than highlight the wrong lines.
  if (mismatch && !lyrics.autoSynced) lyrics = { ...lyrics, videoMismatch: mismatch };

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
