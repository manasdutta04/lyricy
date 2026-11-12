import anyAscii from 'any-ascii';
import { romanizeHangul } from './hangul';
import { transliterateIndic } from './indic';
import { dominantScript, hasNonLatin, type Script } from './script';

/** Scripts we can romanize well enough to show by default. */
export function canRomanize(script: Script): boolean {
  // Japanese kanji need a dictionary to read correctly (any-ascii would give Chinese
  // readings), so Japanese is only romanized when a romaji version exists upstream.
  return script !== 'japanese' && script !== 'latin' && script !== 'none';
}

const HAN_RUN = /[㐀-䶿一-鿿豈-﫿]+/g;
const HANGUL_RUN = /[가-힯]+/g;

/** Chinese → toneless pinyin with spaces between syllables: 我爱你 → "wo ai ni". */
function pinyin(run: string): string {
  return ` ${anyAscii(run)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()} `;
}

/**
 * Romanizes one lyric line. Returns the input unchanged when it's already Latin.
 * Mixed lines ("Tu hi meri शब है") keep their Latin parts as they are.
 */
export function romanizeLine(text: string): string {
  if (!hasNonLatin(text)) return text;
  let out = transliterateIndic(text);
  out = out.replace(HANGUL_RUN, (run) => romanizeHangul(run));
  out = out.replace(HAN_RUN, pinyin);
  if (hasNonLatin(out)) out = anyAscii(out);
  out = out.replace(/\s{2,}/g, ' ').trim();
  // Lyrics lines conventionally start with a capital letter.
  return out.replace(
    /^([("'¿¡]*)([a-z])/,
    (_m, lead: string, ch: string) => lead + ch.toUpperCase(),
  );
}

export function lyricsScript(lines: readonly { text: string }[]): Script {
  return dominantScript(lines.map((l) => l.text).join('\n'));
}
