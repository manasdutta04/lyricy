export type Script =
  | 'latin'
  | 'devanagari'
  | 'gurmukhi'
  | 'hangul'
  | 'japanese'
  | 'han'
  | 'other'
  | 'none';

const PATTERNS = {
  latin: /[A-Za-zÀ-ɏ]/g,
  devanagari: /[ऀ-ॿ]/g,
  gurmukhi: /[਀-੿]/g,
  hangul: /[가-힯ᄀ-ᇿ㄰-㆏]/g,
  kana: /[぀-ヿㇰ-ㇿ]/g,
  han: /[㐀-䶿一-鿿豈-﫿]/g,
  letter: /\p{L}/gu,
} as const;

const count = (text: string, re: RegExp) => text.match(re)?.length ?? 0;

/** Script that most of the letters in `text` are written in. */
export function dominantScript(text: string): Script {
  const letters = count(text, PATTERNS.letter);
  if (letters === 0) return 'none';

  const kana = count(text, PATTERNS.kana);
  const han = count(text, PATTERNS.han);
  const counts: [Script, number][] = [
    ['latin', count(text, PATTERNS.latin)],
    ['devanagari', count(text, PATTERNS.devanagari)],
    ['gurmukhi', count(text, PATTERNS.gurmukhi)],
    ['hangul', count(text, PATTERNS.hangul)],
    // Any kana means Japanese (kanji included); kanji alone means Chinese.
    [kana > 0 ? 'japanese' : 'han', kana + han],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  const [script, n] = counts[0] ?? ['other', 0];
  return n === 0 ? 'other' : n / letters >= 0.5 ? script : n > 0 ? script : 'other';
}

/** True when the text is already in Latin letters (English, Hinglish, Spanish…). */
export function isLatin(text: string): boolean {
  const script = dominantScript(text);
  return script === 'latin' || script === 'none';
}

/** Does the text contain any letters outside the Latin script? */
export function hasNonLatin(text: string): boolean {
  for (const ch of text) {
    if (/\p{L}/u.test(ch) && !/[A-Za-zÀ-ɏ]/.test(ch)) return true;
  }
  return false;
}
