/** Korean Hangul → Revised Romanization, with the common liaison rule (한국어 → hangugeo). */

// biome-ignore format: lookup tables
const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
// biome-ignore format: lookup tables
const MEDIALS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
/** Final consonant as pronounced at the end of a syllable. */
// biome-ignore format: lookup tables
const FINALS = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
/** Final consonant re-pronounced as the next syllable's initial when that starts with silent ㅇ. */
// biome-ignore format: lookup tables
const LIAISON = ['', 'g', 'kk', 'gs', 'n', 'nj', 'n', 'd', 'r', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'r', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', ''];

const SYLLABLE_START = 0xac00;
const SYLLABLE_COUNT = 11172;
const SILENT_INITIAL = 11; // ㅇ

function decompose(ch: string | undefined): [number, number, number] | null {
  if (!ch) return null;
  const code = (ch.codePointAt(0) ?? 0) - SYLLABLE_START;
  if (code < 0 || code >= SYLLABLE_COUNT) return null;
  return [Math.floor(code / 588), Math.floor((code % 588) / 28), code % 28];
}

export function romanizeHangul(text: string): string {
  const chars = [...text];
  let out = '';
  chars.forEach((ch, i) => {
    const parts = decompose(ch);
    if (!parts) {
      out += ch;
      return;
    }
    const [initial, medial, final] = parts;
    out += (INITIALS[initial] ?? '') + (MEDIALS[medial] ?? '');
    if (final === 0) return;
    const next = decompose(chars[i + 1]);
    out += next?.[0] === SILENT_INITIAL ? (LIAISON[final] ?? '') : (FINALS[final] ?? '');
  });
  return out.replace(/lr/g, 'll');
}
