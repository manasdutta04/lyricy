/**
 * Devanagari (Hindi) and Gurmukhi (Punjabi) → Hinglish-style Latin, the way lyrics
 * are usually written online: "मुझको इतना बताए कोई" → "mujhko itna bataaye koi".
 *
 * Plain letter-by-letter transliteration gives "mujhako itanaa bataae koii" because
 * every consonant carries an implicit "a". Hindi drops most of those when spoken,
 * so we apply schwa deletion (word-final, and medial in V·C(a)·CV) plus a few
 * Hinglish spelling conventions (final ा → a, medial ी → ee, "ah"+C → "eh").
 */

interface Table {
  vowels: Record<string, string>;
  matras: Record<string, string>;
  consonants: Record<string, string>;
  /** Consonant + nukta → Latin (Urdu-origin sounds). */
  nukta: Record<string, string>;
  /** Precomposed nukta letters. */
  composed: Record<string, string>;
  virama: string;
  nuktaSign: string;
  nasals: string;
  visarga: string;
  /** Gurmukhi addak (ੱ): doubles the next consonant. */
  addak?: string;
  /** Gurmukhi vowel carriers (ੳ ਅ ੲ) that take a matra to form a vowel. */
  carriers?: Record<string, string>;
  digitZero: number;
  /** Whole-word overrides for very common words with fixed Hinglish spellings. */
  words: Record<string, string>;
  /** Sound of the implicit vowel: "a" in Hindi/Punjabi, "o" in Bengali (মন → mon). */
  inherent?: string;
  /** Write long vowels short, as Bengali is usually romanized (আমার → amar, not aamaar). */
  shortVowels?: boolean;
  /** Sign written as "ng" (Bengali anusvara ং: বাংলা → bangla). */
  ngSign?: string;
  /** Letters that never carry a vowel (Bengali khanda ta ৎ). */
  standalone?: Record<string, string>;
  /** Consonant pronounced "y" after a virama (Bengali য-phala). */
  yaPhala?: string;
}

const DEVANAGARI: Table = {
  vowels: {
    अ: 'a',
    आ: 'aa',
    इ: 'i',
    ई: 'ee',
    उ: 'u',
    ऊ: 'oo',
    ऋ: 'ri',
    ए: 'e',
    ऐ: 'ai',
    ओ: 'o',
    औ: 'au',
    ऑ: 'o',
    ऍ: 'e',
  },
  matras: {
    'ा': 'aa',
    'ि': 'i',
    'ी': 'ee',
    'ु': 'u',
    'ू': 'oo',
    'ृ': 'ri',
    'े': 'e',
    'ै': 'ai',
    'ो': 'o',
    'ौ': 'au',
    'ॉ': 'o',
    'ॅ': 'e',
  },
  consonants: {
    क: 'k',
    ख: 'kh',
    ग: 'g',
    घ: 'gh',
    ङ: 'n',
    च: 'ch',
    छ: 'chh',
    ज: 'j',
    झ: 'jh',
    ञ: 'n',
    ट: 't',
    ठ: 'th',
    ड: 'd',
    ढ: 'dh',
    ण: 'n',
    त: 't',
    थ: 'th',
    द: 'd',
    ध: 'dh',
    न: 'n',
    प: 'p',
    फ: 'ph',
    ब: 'b',
    भ: 'bh',
    म: 'm',
    य: 'y',
    र: 'r',
    ल: 'l',
    व: 'v',
    श: 'sh',
    ष: 'sh',
    स: 's',
    ह: 'h',
    ळ: 'l',
  },
  nukta: { क: 'q', ख: 'kh', ग: 'gh', ज: 'z', फ: 'f', ड: 'd', ढ: 'dh', य: 'y' },
  composed: {
    क़: 'q',
    ख़: 'kh',
    ग़: 'gh',
    ज़: 'z',
    ड़: 'd',
    ढ़: 'dh',
    फ़: 'f',
    य़: 'y',
  },
  virama: '्',
  nuktaSign: '़',
  nasals: 'ंँ',
  visarga: 'ः',
  digitZero: 0x0966,
  words: {
    है: 'hai',
    हैं: 'hain',
    मैं: 'main',
    में: 'mein',
    हूँ: 'hoon',
    हूं: 'hoon',
    हम: 'hum',
    तुम: 'tum',
    नहीं: 'nahi',
    नहिं: 'nahi',
    क्यों: 'kyun',
    क्यूँ: 'kyun',
    क्यूं: 'kyun',
    यूँ: 'yun',
    यूं: 'yun',
    वो: 'woh',
    वह: 'woh',
    यह: 'yeh',
    ये: 'ye',
    और: 'aur',
    वहाँ: 'wahan',
    वहां: 'wahan',
    यहाँ: 'yahan',
    यहां: 'yahan',
    कहाँ: 'kahan',
    कहां: 'kahan',
    जहाँ: 'jahan',
    जहां: 'jahan',
    ओ: 'o',
    ना: 'na',
    गया: 'gaya',
    गयी: 'gayi',
    गई: 'gayi',
    रहा: 'raha',
    रही: 'rahi',
    कहा: 'kaha',
    सा: 'sa',
    ज्ञान: 'gyaan',
  },
};

const GURMUKHI: Table = {
  vowels: { ਅ: 'a', ਆ: 'aa', ਇ: 'i', ਈ: 'ee', ਉ: 'u', ਊ: 'oo', ਏ: 'e', ਐ: 'ai', ਓ: 'o', ਔ: 'au' },
  matras: {
    'ਾ': 'aa',
    'ਿ': 'i',
    'ੀ': 'ee',
    'ੁ': 'u',
    'ੂ': 'oo',
    'ੇ': 'e',
    'ੈ': 'ai',
    'ੋ': 'o',
    'ੌ': 'au',
  },
  consonants: {
    ਕ: 'k',
    ਖ: 'kh',
    ਗ: 'g',
    ਘ: 'gh',
    ਙ: 'n',
    ਚ: 'ch',
    ਛ: 'chh',
    ਜ: 'j',
    ਝ: 'jh',
    ਞ: 'n',
    ਟ: 't',
    ਠ: 'th',
    ਡ: 'd',
    ਢ: 'dh',
    ਣ: 'n',
    ਤ: 't',
    ਥ: 'th',
    ਦ: 'd',
    ਧ: 'dh',
    ਨ: 'n',
    ਪ: 'p',
    ਫ: 'ph',
    ਬ: 'b',
    ਭ: 'bh',
    ਮ: 'm',
    ਯ: 'y',
    ਰ: 'r',
    ਲ: 'l',
    ਵ: 'v',
    ੜ: 'r',
    ਸ: 's',
    ਹ: 'h',
  },
  nukta: { ਸ: 'sh', ਖ: 'kh', ਗ: 'gh', ਜ: 'z', ਫ: 'f', ਲ: 'l' },
  composed: { ਸ਼: 'sh', ਖ਼: 'kh', ਗ਼: 'gh', ਜ਼: 'z', ਫ਼: 'f', ਲ਼: 'l' },
  virama: '੍',
  nuktaSign: '਼',
  nasals: 'ੰਂ',
  visarga: 'ਃ',
  addak: 'ੱ',
  carriers: { ੳ: '', ਅ: 'a', ੲ: '' },
  digitZero: 0x0a66,
  words: { ਹੈ: 'hai', ਮੈਂ: 'main', ਤੂੰ: 'tu', ਨਹੀਂ: 'nahi', ਵੇ: 've', ਨੀ: 'ni' },
};

const BENGALI: Table = {
  vowels: {
    অ: 'o',
    আ: 'a',
    ই: 'i',
    ঈ: 'i',
    উ: 'u',
    ঊ: 'u',
    ঋ: 'ri',
    এ: 'e',
    ঐ: 'oi',
    ও: 'o',
    ঔ: 'ou',
  },
  matras: {
    'া': 'a',
    'ি': 'i',
    'ী': 'i',
    'ু': 'u',
    'ূ': 'u',
    'ৃ': 'ri',
    'ে': 'e',
    'ৈ': 'oi',
    'ো': 'o',
    'ৌ': 'ou',
  },
  consonants: {
    ক: 'k',
    খ: 'kh',
    গ: 'g',
    ঘ: 'gh',
    ঙ: 'ng',
    চ: 'ch',
    ছ: 'chh',
    জ: 'j',
    ঝ: 'jh',
    ঞ: 'n',
    ট: 't',
    ঠ: 'th',
    ড: 'd',
    ঢ: 'dh',
    ণ: 'n',
    ত: 't',
    থ: 'th',
    দ: 'd',
    ধ: 'dh',
    ন: 'n',
    প: 'p',
    ফ: 'ph',
    ব: 'b',
    ভ: 'bh',
    ম: 'm',
    য: 'j',
    র: 'r',
    ল: 'l',
    শ: 'sh',
    ষ: 'sh',
    স: 's',
    হ: 'h',
  },
  nukta: { ড: 'r', ঢ: 'rh', য: 'y' },
  composed: { ড়: 'r', ঢ়: 'rh', য়: 'y' },
  virama: '্',
  nuktaSign: '়',
  nasals: 'ঁ',
  visarga: 'ঃ',
  digitZero: 0x09e6,
  inherent: 'o',
  shortVowels: true,
  ngSign: 'ং',
  standalone: { ৎ: 't' },
  yaPhala: 'য',
  words: {
    আমি: 'ami',
    তুমি: 'tumi',
    আমার: 'amar',
    তোমার: 'tomar',
    তোমাকে: 'tomake',
    আমাকে: 'amake',
    ভালোবাসি: 'bhalobashi',
    ভালবাসি: 'bhalobashi',
    ভালোবাসা: 'bhalobasha',
    না: 'na',
    কি: 'ki',
    কী: 'ki',
    কেন: 'keno',
    এই: 'ei',
    সে: 'she',
    হয়: 'hoy',
    আর: 'ar',
    মন: 'mon',
    ও: 'o',
    আছে: 'ache',
    আছো: 'acho',
    হবে: 'hobe',
    যে: 'je',
    শুধু: 'shudhu',
    আকাশ: 'akash',
  },
};

const INHERENT = 'INHERENT';
type VowelSlot = typeof INHERENT | string | null; // null = vowel killed (virama / deleted)

interface Unit {
  kind: 'C' | 'V' | 'X';
  latin: string;
  /** For C: inherent, a matra character, or null. For V: the vowel's Latin. */
  vowel: VowelSlot;
  nasal: boolean;
  double: boolean;
  /** Schwa removed by deletion rules (not by an explicit virama). */
  deleted?: boolean;
  /** Followed by an "ng" sign (Bengali ং). */
  ng?: boolean;
}

function parseWord(word: string, t: Table): Unit[] {
  const units: Unit[] = [];
  const chars = [...word.normalize('NFC')];
  let pendingDouble = false;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? '';
    const next = chars[i + 1];

    if (t.standalone?.[ch] !== undefined) {
      units.push({
        kind: 'X',
        latin: t.standalone[ch] ?? '',
        vowel: null,
        nasal: false,
        double: false,
      });
      continue;
    }

    if (t.composed[ch] !== undefined || t.consonants[ch] !== undefined) {
      let latin = t.composed[ch] ?? t.consonants[ch] ?? '';
      if (next === t.nuktaSign) {
        latin = t.nukta[ch] ?? latin;
        i++;
      } else if (ch === t.yaPhala) {
        const prevUnit = units[units.length - 1];
        if (prevUnit?.kind === 'C' && prevUnit.vowel === null) latin = 'y';
      }
      const unit: Unit = { kind: 'C', latin, vowel: INHERENT, nasal: false, double: pendingDouble };
      pendingDouble = false;
      const after = chars[i + 1];
      if (after !== undefined && t.matras[after] !== undefined) {
        unit.vowel = after;
        i++;
      } else if (after === t.virama) {
        unit.vowel = null;
        i++;
      }
      units.push(unit);
      continue;
    }

    if (t.carriers?.[ch] !== undefined) {
      const after = chars[i + 1];
      if (after !== undefined && t.matras[after] !== undefined) {
        units.push({
          kind: 'V',
          latin: t.matras[after] ?? '',
          vowel: after,
          nasal: false,
          double: false,
        });
        i++;
      } else {
        units.push({
          kind: 'V',
          latin: t.carriers[ch] || 'a',
          vowel: ch,
          nasal: false,
          double: false,
        });
      }
      continue;
    }

    if (t.vowels[ch] !== undefined) {
      units.push({ kind: 'V', latin: t.vowels[ch] ?? '', vowel: ch, nasal: false, double: false });
      continue;
    }

    const last = units[units.length - 1];
    if (ch === t.ngSign) {
      if (last) last.ng = true;
      continue;
    }
    if (t.nasals.includes(ch)) {
      if (last) last.nasal = true;
      continue;
    }
    if (ch === t.addak) {
      pendingDouble = true;
      continue;
    }
    if (ch === t.visarga) {
      units.push({ kind: 'X', latin: 'h', vowel: null, nasal: false, double: false });
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code >= t.digitZero && code <= t.digitZero + 9) {
      units.push({
        kind: 'X',
        latin: String(code - t.digitZero),
        vowel: null,
        nasal: false,
        double: false,
      });
      continue;
    }
    if (ch === '।' || ch === '॥') {
      units.push({ kind: 'X', latin: '.', vowel: null, nasal: false, double: false });
      continue;
    }
    units.push({ kind: 'X', latin: ch, vowel: null, nasal: false, double: false });
  }
  return units;
}

const hasVowel = (u: Unit | undefined) =>
  !!u && (u.kind === 'V' || (u.kind === 'C' && u.vowel !== null));

function deleteSchwas(units: Unit[]): void {
  const consonantCount = units.filter((u) => u.kind === 'C').length;
  const last = units[units.length - 1];
  // Word-final schwa: "दिल" → dil. Keep it in one-letter words ("न" → na).
  if (
    last?.kind === 'C' &&
    last.vowel === INHERENT &&
    consonantCount > 1 &&
    !last.nasal &&
    !last.ng
  ) {
    last.vowel = null;
    last.deleted = true;
  }
  // Medial: V C(a) C V → V C C V, scanning right to left.
  for (let k = units.length - 2; k >= 1; k--) {
    const u = units[k];
    const prev = units[k - 1];
    const next = units[k + 1];
    if (u?.kind !== 'C' || u.vowel !== INHERENT || u.nasal || u.ng) continue;
    if (!hasVowel(prev) || prev?.nasal || prev?.ng) continue; // avoid 3-consonant clusters (zindagi)
    if (next?.kind !== 'C' || next.vowel === null) continue;
    u.vowel = null;
    u.deleted = true;
  }
}

function matraLatin(matra: string, t: Table, isFinal: boolean, nasal: boolean): string {
  const base = t.matras[matra] ?? '';
  if (t.shortVowels) return base;
  if (base === 'aa') return isFinal && !nasal ? 'a' : 'aa';
  if (base === 'ee') return isFinal ? 'i' : 'ee';
  if (base === 'oo') return isFinal && !nasal ? 'u' : 'oo';
  if (base === 'e' && nasal && isFinal) return 'ei';
  return base;
}

function render(units: Unit[], t: Table): string {
  let out = '';
  units.forEach((u, i) => {
    const isFinal = i === units.length - 1;
    const prev = units[i - 1];
    const next = units[i + 1];
    let piece = '';

    if (u.kind === 'C') {
      piece = u.double ? u.latin.charAt(0) + u.latin : u.latin;
      if (u.vowel === INHERENT) {
        const inherent = t.inherent ?? 'a';
        // Hinglish "eh": पहले → pehle, रहना → rehna.
        piece += inherent === 'a' && next?.latin === 'h' && next.deleted ? 'e' : inherent;
      } else if (u.vowel) {
        piece += matraLatin(u.vowel, t, isFinal, u.nasal);
      }
    } else if (u.kind === 'V') {
      let v = u.latin;
      if (v === 'aa' && isFinal && !u.nasal) v = 'a';
      if (v === 'ee' && isFinal) v = 'i';
      if (v === 'e' && hasVowel(prev)) v = 'ye'; // बताए → bataaye
      piece = v;
    } else {
      piece = u.latin;
    }

    if (u.ng) {
      piece += 'ng';
    } else if (u.nasal && u.kind !== 'X') {
      const following = next?.latin ?? '';
      piece += /^[pbm]/.test(following) ? 'm' : 'n';
    }
    out += piece;
  });
  // ज्ञ is pronounced "gy".
  return out.replace(/jn(?=[aeiou])/g, 'gy');
}

function tableFor(word: string): Table | null {
  for (const ch of word) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x0900 && c <= 0x097f) return DEVANAGARI;
    if (c >= 0x0a00 && c <= 0x0a7f) return GURMUKHI;
    if (c >= 0x0980 && c <= 0x09ff) return BENGALI;
  }
  return null;
}

/** Transliterates one Devanagari/Gurmukhi word. */
export function transliterateIndicWord(word: string): string {
  const t = tableFor(word);
  if (!t) return word;
  const override = t.words[word.normalize('NFC')];
  if (override) return override;
  const units = parseWord(word, t);
  deleteSchwas(units);
  return render(units, t);
}

const INDIC_RUN = /[ऀ-ॿঀ-৿਀-੿]+/g;

/** Transliterates every Devanagari/Gurmukhi run in `text`, leaving the rest alone. */
export function transliterateIndic(text: string): string {
  return text.replace(INDIC_RUN, (run) => transliterateIndicWord(run));
}
