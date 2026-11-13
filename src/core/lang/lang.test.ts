import { describe, expect, it } from 'vitest';
import { romanizeHangul } from './hangul';
import { transliterateIndic } from './indic';
import { romanizeLine } from './romanize';
import { dominantScript, isLatin } from './script';

describe('transliterateIndic (Hinglish)', () => {
  it.each([
    ['मुझको इतना बताए कोई', 'mujhko itna bataaye koi'],
    ['आधा तेरा, इश्क़ आधा मेरा', 'aadha tera, ishq aadha mera'],
    ['पहले भी मैं तुम से मिला हूँ', 'pehle bhi main tum se mila hoon'],
    ['दिल का दरिया बह ही गया', 'dil ka dariya beh hi gaya'],
    ['ज़िंदगी', 'zindagi'],
    ['मोहब्बत', 'mohabbat'],
    ['धड़कन', 'dhadkan'],
    ['समझना', 'samajhna'],
    ['प्यार', 'pyaar'],
    ['जीना', 'jeena'],
    ['आँखें', 'aankhein'],
    ['चाँद', 'chaand'],
    ['तेरी', 'teri'],
    ['रहना', 'rehna'],
    ['दिल्ली', 'dilli'],
    ['संभाल', 'sambhaal'],
    ['कोई नहीं', 'koi nahi'],
    ['तू', 'tu'],
  ])('%s → %s', (input, expected) => {
    expect(transliterateIndic(input)).toBe(expected);
  });

  it('handles Gurmukhi with addak', () => {
    expect(transliterateIndic('ਹੱਸ ਹੱਸ')).toBe('hass hass');
    expect(transliterateIndic('ਪਿਆਰ')).toBe('piaar');
  });

  it.each([
    ['আমি তোমাকে ভালোবাসি', 'ami tomake bhalobashi'],
    ['আমার সোনার বাংলা', 'amar sonar bangla'],
    ['কথা', 'kotha'],
    ['জীবন', 'jibon'],
    ['করলাম', 'korlam'],
    ['মনে পড়ে', 'mone pore'],
    ['চোখের জল', 'chokher jol'],
    ['সত্যি', 'sotyi'],
    ['মন্ত্র তন্ত্র', 'montro tontro'],
    ['ভক্ত', 'bhokto'],
  ])('Bengali %s → %s', (input, expected) => {
    expect(transliterateIndic(input)).toBe(expected);
  });

  it('leaves Latin text alone', () => {
    expect(transliterateIndic('Tu hi meri शब है')).toBe('Tu hi meri shab hai');
  });
});

describe('romanizeHangul', () => {
  it.each([
    ['사랑해요', 'saranghaeyo'],
    ['한국어', 'hangugeo'],
    ['안녕하세요', 'annyeonghaseyo'],
  ])('%s → %s', (input, expected) => {
    expect(romanizeHangul(input)).toBe(expected);
  });
});

describe('romanizeLine', () => {
  it('romanizes Chinese with syllable spaces', () => {
    expect(romanizeLine('我爱你')).toBe('Wo ai ni');
  });
  it('capitalizes Hinglish lines', () => {
    expect(romanizeLine('दिल का दरिया')).toBe('Dil ka dariya');
  });
  it('romanizes Cyrillic', () => {
    expect(romanizeLine('Привет мир')).toBe('Privet mir');
  });
  it('returns Latin unchanged', () => {
    expect(romanizeLine('Never gonna give you up')).toBe('Never gonna give you up');
  });
});

describe('dominantScript', () => {
  it('detects scripts', () => {
    expect(dominantScript('मुझको इतना बताए कोई')).toBe('devanagari');
    expect(dominantScript('無敵の笑顔で荒らすメディア')).toBe('japanese');
    expect(dominantScript('我爱你')).toBe('han');
    expect(dominantScript('사랑해요')).toBe('hangul');
    expect(dominantScript('আমার সোনার বাংলা')).toBe('bengali');
    expect(romanizeLine('আমার সোনার বাংলা')).toBe('Amar sonar bangla');
    expect(isLatin('Señorita, I love it')).toBe(true);
  });
});
