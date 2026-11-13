/**
 * Indian scripts (Devanagari, Bengali, Gurmukhi, Gujarati…) are laid out in
 * parallel Unicode blocks: क U+0915, ক U+0995, ਕ U+0A15, ક U+0A95. So text can be
 * moved between them letter by letter, with a few fix-ups for letters a script
 * doesn't have.
 */

export type BrahmicScript = 'devanagari' | 'bengali' | 'gurmukhi' | 'gujarati';

const BLOCK: Record<BrahmicScript, number> = {
  devanagari: 0x0900,
  bengali: 0x0980,
  gurmukhi: 0x0a00,
  gujarati: 0x0a80,
};

const SCRIPT_TEST: Record<BrahmicScript, RegExp> = {
  devanagari: /\p{Script=Devanagari}/u,
  bengali: /\p{Script=Bengali}/u,
  gurmukhi: /\p{Script=Gurmukhi}/u,
  gujarati: /\p{Script=Gujarati}/u,
};

/** Devanagari letters with no direct twin in the target script → closest letter. */
const FALLBACK: Partial<Record<BrahmicScript, Record<string, string>>> = {
  bengali: {
    व: 'ব',
    ळ: 'ল',
    ऴ: 'ল',
    ऩ: 'ন',
    ऱ: 'র',
    क़: 'ক',
    ख़: 'খ',
    ग़: 'গ',
    ज़: 'জ',
    फ़: 'ফ',
    ऑ: 'অ',
    'ॉ': 'ো',
    ऍ: 'এ',
    'ॅ': 'ে',
    ऎ: 'এ',
    'ॆ': 'ে',
    ऒ: 'ও',
    'ॊ': 'ো',
    '।': '।',
    '॥': '॥',
  },
  gujarati: {
    ऴ: 'ળ',
    ऩ: 'ન',
    ऱ: 'ર',
    क़: 'ક',
    ख़: 'ખ',
    ग़: 'ગ',
    ज़: 'જ',
    ड़: 'ડ',
    ढ़: 'ઢ',
    फ़: 'ફ',
    ऎ: 'એ',
    'ॆ': 'ે',
    ऒ: 'ઓ',
    'ॊ': 'ો',
  },
  gurmukhi: { ऴ: 'ਲ', ऩ: 'ਨ', ऱ: 'ਰ', ऑ: 'ਔ', 'ॉ': 'ੌ', ऋ: 'ਰਿ', 'ृ': '੍ਰਿ', ष: 'ਸ਼', श: 'ਸ਼' },
};

/** Moves text from one Indian script to another, leaving everything else alone. */
export function convertScript(text: string, from: BrahmicScript, to: BrahmicScript): string {
  if (from === to) return text;
  const fromStart = BLOCK[from];
  const toStart = BLOCK[to];
  const fallback = from === 'devanagari' ? FALLBACK[to] : undefined;
  let out = '';
  for (const ch of text.normalize('NFC')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < fromStart || code > fromStart + 0x7f) {
      out += ch;
      continue;
    }
    const mapped = fallback?.[ch];
    if (mapped) {
      out += mapped;
      continue;
    }
    const target = String.fromCodePoint(code - fromStart + toStart);
    out += SCRIPT_TEST[to].test(target) ? target : ch;
  }
  return out;
}

const COUNT: Record<BrahmicScript, RegExp> = {
  devanagari: /[ऀ-ॿ]/g,
  bengali: /[ঀ-৿]/g,
  gurmukhi: /[਀-੿]/g,
  gujarati: /[઀-૿]/g,
};

/** Bengali / Gujarati / Punjabi music labels whose uploads are in that language. */
const LABEL_LANGUAGE: [RegExp, BrahmicScript][] = [
  [
    /\b(svf|amara muzik|zee music bangla|t-series bangla|eskay|angel digital|sa re ga ma bangla|bengali|bangla)\b/i,
    'bengali',
  ],
  [/\b(gujarati|studio saraswati|soorpancham|zee music gujarati)\b/i, 'gujarati'],
  [/\b(punjabi|speed records|white hill|desi melodies)\b/i, 'gurmukhi'],
];

/**
 * The script the song's language is written in, guessed from the video: Indian
 * script in the title ("Ami Mantra Tantra (আমি মন্ত্র তন্ত্র)"), or a regional
 * label/channel. Undefined when there's no signal.
 */
export function songScript(title: string, channel: string): BrahmicScript | undefined {
  let best: BrahmicScript | undefined;
  let bestCount = 0;
  for (const [script, re] of Object.entries(COUNT) as [BrahmicScript, RegExp][]) {
    const n = title.match(re)?.length ?? 0;
    if (n > bestCount) {
      best = script;
      bestCount = n;
    }
  }
  if (best) return best;
  for (const [re, script] of LABEL_LANGUAGE) if (re.test(`${channel} ${title}`)) return script;
  return undefined;
}
