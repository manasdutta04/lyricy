import { artistSimilarity, normalize, similarity } from './similarity';

export interface MatchQuery {
  artist: string;
  title: string;
  durationSec?: number;
  /**
   * 'tight' when durationSec is a canonical track length (iTunes);
   * 'loose' when it's the YouTube video length (MVs add intros/outros).
   */
  durationKind?: 'tight' | 'loose';
}

export interface MatchCandidate {
  artist: string;
  title: string;
  album?: string;
  durationSec?: number;
  synced?: boolean;
}

/** Neutral artist score when the video doesn't tell us the artist (label uploads). */
const UNKNOWN_ARTIST = 0.5;

/**
 * Title similarity that also accepts:
 * - extra words after the song name ("Tum Hi Ho Aashiqui 2" vs "Tum Hi Ho"),
 * - the film/album named in the video title ("Song Movie" vs title + album).
 */
export function titleSimilarity(queryTitle: string, candidate: MatchCandidate): number {
  let best = similarity(queryTitle, candidate.title);
  if (best === 1) return 1;
  if (candidate.album) {
    best = Math.max(best, similarity(queryTitle, `${candidate.title} ${candidate.album}`) * 0.95);
  }
  const q = normalize(queryTitle);
  const c = normalize(candidate.title);
  if (c.length >= 4 && q.length > c.length) {
    if (q.startsWith(`${c} `)) best = Math.max(best, 0.85);
  }
  return best;
}

export function durationScore(query: MatchQuery, candidate: MatchCandidate): number {
  if (!query.durationSec || !candidate.durationSec) return 0.5;
  const signed = query.durationSec - candidate.durationSec;
  // A video much shorter than the song is an edit/teaser/Short: length says nothing.
  if (query.durationKind !== 'tight' && signed < -15) return 0.5;
  const diff = Math.abs(signed);
  const [full, zero] = query.durationKind === 'tight' ? [2, 15] : [4, 45];
  if (diff <= full) return 1;
  if (diff >= zero) return 0;
  return 1 - (diff - full) / (zero - full);
}

export const WEIGHTS = { title: 0.4, artist: 0.3, duration: 0.2, synced: 0.1 } as const;

/** 0..1 confidence that `candidate` is the song described by `query`. */
export function scoreCandidate(query: MatchQuery, candidate: MatchCandidate): number {
  const title = titleSimilarity(query.title, candidate);
  const artist = query.artist.trim()
    ? artistSimilarity(query.artist, candidate.artist)
    : UNKNOWN_ARTIST;
  // Title-artist swapped uploads ("Song - Artist") are common; allow it at a small discount.
  const swapped = query.artist.trim()
    ? (similarity(query.title, candidate.artist) +
        artistSimilarity(query.artist, candidate.title)) /
      2
    : 0;
  const textScore = Math.max(
    WEIGHTS.title * title + WEIGHTS.artist * artist,
    (WEIGHTS.title + WEIGHTS.artist) * swapped * 0.9,
  );
  const score =
    textScore +
    WEIGHTS.duration * durationScore(query, candidate) +
    WEIGHTS.synced * (candidate.synced ? 1 : 0) -
    versionPenalty(`${query.title} ${query.artist}`, candidate.title);
  // The right artist with the wrong song is still the wrong song.
  const titleMatch = Math.max(
    title,
    query.artist.trim() ? artistSimilarity(query.artist, candidate.title) : 0,
  );
  return titleMatch < MIN_TITLE_MATCH ? Math.min(score, TITLE_MISMATCH_CAP) : score;
}

/** Below this title similarity a candidate can't be accepted, however good the rest is. */
const MIN_TITLE_MATCH = 0.45;
const TITLE_MISMATCH_CAP = 0.45;

const VERSION_TAGS = [
  'remix',
  'mix',
  'live',
  'acoustic',
  'unplugged',
  'instrumental',
  'karaoke',
  'cover',
  'sped up',
  'slowed',
  'reverb',
  'lofi',
  'lo-fi',
  'reprise',
  'remaster',
  'demo',
  'edit',
  'version',
  'mashup',
  'female',
  'male',
  'duet',
  'extended',
  'radio',
  'nightcore',
  'bass',
  'dj',
  'jhankar',
  'flip',
  'rendition',
  'trap',
  'rework',
  'bootleg',
  'chill',
  'phonk',
  '8d',
] as const;

const tagPatterns = VERSION_TAGS.map((tag) => ({
  tag,
  // Tags contain only letters, digits, spaces and '-', all literal outside a class.
  re: new RegExp(`(^|[^\\p{L}])${tag}($|[^\\p{L}])`, 'iu'),
}));

function versionTags(s: string): Set<string> {
  const tags = new Set<string>();
  // "Versión" → "Version"
  const folded = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  for (const { tag, re } of tagPatterns) if (re.test(folded)) tags.add(tag);
  return tags;
}

/**
 * Titles are compared without their brackets, so "Song (Live)" would equal "Song".
 * Penalize when one side names a version (remix, live, sped up…) the other doesn't.
 */
export function versionPenalty(queryText: string, candidateTitle: string): number {
  const q = versionTags(queryText);
  const c = versionTags(candidateTitle);
  let mismatches = 0;
  for (const t of c) if (!q.has(t)) mismatches++;
  for (const t of q) if (!c.has(t)) mismatches++;
  return Math.min(0.3, mismatches * 0.15);
}

/** Best score of a candidate against several interpretations of the video. */
export function bestScore(queries: MatchQuery[], candidate: MatchCandidate): number {
  let best = 0;
  for (const q of queries) best = Math.max(best, scoreCandidate(q, candidate));
  return best;
}
