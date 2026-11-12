const BRACKETED = /[([{【「『][^)\]}】」』]*[)\]}】」』]/g;
const FEATURING = /\s(?:feat|ft|featuring)\.?\s.*$/;

/**
 * Normalizes a title/artist for comparison: folds case and Latin accents, drops
 * bracketed parts and "feat." tails, keeps letters/marks/digits of every script.
 */
export function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(BRACKETED, ' ')
    .replace(FEATURING, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const compact = s.replace(/ /g, '');
  const grams = new Map<string, number>();
  const chars = [...compact];
  for (let i = 0; i < chars.length - 1; i++) {
    const g = `${chars[i]}${chars[i + 1]}`;
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

function dice(a: string, b: string): number {
  const ga = bigrams(a);
  const gb = bigrams(b);
  let total = 0;
  let overlap = 0;
  for (const n of ga.values()) total += n;
  for (const n of gb.values()) total += n;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return total === 0 ? 0 : (2 * overlap) / total;
}

function tokenJaccard(a: string, b: string): number {
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** 0..1 similarity between two titles (order-insensitive, typo-tolerant). */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return Math.max(dice(na, nb), tokenJaccard(na, nb));
}

const ARTIST_SPLIT = /\s*(?:,|&|\+|\/|;|\s(?:x|and|with|feat\.?|ft\.?|featuring|vs\.?)\s)\s*/i;

export function splitArtists(artist: string): string[] {
  return artist
    .split(ARTIST_SPLIT)
    .map((a) => a.trim())
    .filter(Boolean);
}

/** Artist similarity that tolerates collaborations ("A, B & C" vs "B"). */
export function artistSimilarity(a: string, b: string): number {
  let best = similarity(a, b);
  const sa = splitArtists(a);
  const sb = splitArtists(b);
  if (sa.length > 1 || sb.length > 1) {
    for (const x of sa) for (const y of sb) best = Math.max(best, similarity(x, y) * 0.95);
  }
  return best;
}
