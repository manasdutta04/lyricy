import { describe, expect, it } from 'vitest';
import type { CaptionWord } from '../agent/protocol';
import { alignLines, autoSync, estimateOffset, wordKey } from './align';
import type { LyricLine } from './types';

const LYRICS = [
  'Hum tere bin ab reh nahi sakte',
  'Tere bina kya wajood mera',
  'Tujhse juda gar ho jaayenge',
  'Toh khud se hi ho jaayenge judaa',
  'Kyunki tum hi ho',
  'Ab tum hi ho',
  'Zindagi ab tum hi ho',
  'Chain bhi mera dard bhi',
];

/** Fake ASR: each line's words spoken 300 ms apart, lines 4 s apart, starting at `t0`. */
function asrFor(lines: string[], t0: number, spell = (w: string) => w): CaptionWord[] {
  return lines.flatMap((line, i) =>
    line.split(' ').map((w, j) => ({ start: t0 + i * 4000 + j * 300, text: spell(w) })),
  );
}

describe('wordKey', () => {
  it('matches spelling variants and Devanagari', () => {
    expect(wordKey('jaayenge')).toBe(wordKey('jayenge'));
    expect(wordKey('तुम')).toBe(wordKey('tum'));
  });
});

describe('alignLines', () => {
  it('finds each line in the ASR stream', () => {
    const starts = alignLines(
      LYRICS.map((text) => ({ text })),
      asrFor(LYRICS, 10_000),
    );
    expect(starts).toEqual(LYRICS.map((_, i) => 10_000 + i * 4000));
  });

  it('tolerates ASR misspellings and missing words', () => {
    const noisy = asrFor(LYRICS, 0, (w) => (w === 'mera' ? 'mere' : w.replace('aa', 'a')));
    const starts = alignLines(
      LYRICS.map((text) => ({ text })),
      noisy.filter((_, i) => i % 7 !== 3),
    );
    expect(starts.filter((s) => s !== null).length).toBeGreaterThanOrEqual(6);
  });
});

describe('autoSync', () => {
  it('times plain lyrics and interpolates unmatched lines', () => {
    const plain: LyricLine[] = [...LYRICS, 'xyzzy plugh'].map((text) => ({
      start: 0,
      end: 0,
      text,
    }));
    const synced = autoSync(plain, asrFor(LYRICS, 5000));
    expect(synced?.[0]?.start).toBe(5000);
    expect(synced?.[3]?.start).toBe(17_000);
    expect(synced?.[8]?.start).toBeGreaterThan(synced?.[7]?.start ?? 0);
  });

  it('gives up when the captions are unrelated', () => {
    const plain: LyricLine[] = LYRICS.map((text) => ({ start: 0, end: 0, text }));
    expect(autoSync(plain, asrFor(['completely different words here today'], 0))).toBeNull();
  });
});

describe('estimateOffset', () => {
  it('detects a music-video intro', () => {
    const studio: LyricLine[] = LYRICS.map((text, i) => ({ start: 2000 + i * 4000, end: 0, text }));
    expect(estimateOffset(studio, asrFor(LYRICS, 14_000))).toBe(12_000);
  });

  it('returns 0 when already aligned', () => {
    const studio: LyricLine[] = LYRICS.map((text, i) => ({ start: 2000 + i * 4000, end: 0, text }));
    expect(estimateOffset(studio, asrFor(LYRICS, 2200))).toBe(0);
  });
});
