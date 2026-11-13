import { describe, expect, it } from 'vitest';
import { convertScript, songScript } from './brahmic';
import { romanizeLine } from './romanize';

describe('convertScript', () => {
  it('moves Devanagari into Bengali and Gujarati letters', () => {
    expect(convertScript('मंत्र तंत्र', 'devanagari', 'bengali')).toBe('মংত্র তংত্র');
    expect(convertScript('कुछ नहीं', 'devanagari', 'gujarati')).toBe('કુછ નહીં');
  });

  it('uses the closest letter where a script has no twin', () => {
    expect(convertScript('वो', 'devanagari', 'bengali')).toBe('বো');
  });

  it('leaves other text alone', () => {
    expect(convertScript('Maa मंत्र!', 'devanagari', 'bengali')).toBe('Maa মংত্র!');
  });
});

describe('songScript', () => {
  it('reads the script from the title', () => {
    expect(songScript('Ami Mantra Tantra Kichhui Janine Ma (আমি মন্ত্র তন্ত্র) | SVF', 'SVF')).toBe(
      'bengali',
    );
  });
  it('falls back to regional labels', () => {
    expect(songScript('Mon Bojhe Naa | Chirodini Tumi Je Amar 2', 'SVF')).toBe('bengali');
    expect(songScript('Kesariya | Brahmastra', 'Sony Music India')).toBeUndefined();
  });
});

describe('Gujarati romanization', () => {
  it('reads Gujarati like Hindi', () => {
    expect(romanizeLine('કુછ નહીં')).toBe('Kuchh nahi');
  });
});
