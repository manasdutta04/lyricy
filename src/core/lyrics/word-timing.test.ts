import { describe, expect, it } from 'vitest';
import type { LyricLine } from './types';
import { buildDisplayItems, progress, timeWords } from './word-timing';

describe('timeWords', () => {
  it('uses real word timing when available', () => {
    const line: LyricLine = {
      start: 1000,
      end: 3000,
      text: 'Hello world',
      words: [
        { text: 'Hello ', start: 1000, end: 1600 },
        { text: 'world', start: 1600, end: 2200 },
      ],
    };
    expect(timeWords(line, 'Hello world').map((w) => [w.start, w.end])).toEqual([
      [1000, 1600],
      [1600, 2200],
    ]);
  });

  it('spreads singing time over words by length for line-synced lyrics', () => {
    const line: LyricLine = { start: 0, end: 10_000, text: 'Tum hi ho' };
    const words = timeWords(line, 'Tum hi ho');
    expect(words.map((w) => w.text)).toEqual(['Tum ', 'hi ', 'ho']);
    expect(words[0]?.start).toBe(0);
    // Doesn't stretch a short line across a long pause.
    expect(words[2]?.end).toBeLessThan(2000);
    expect((words[0]?.end ?? 0) - (words[0]?.start ?? 0)).toBeGreaterThan(
      (words[1]?.end ?? 0) - (words[1]?.start ?? 0),
    );
  });

  it('keeps word timing for the romanized text when word counts match', () => {
    const line: LyricLine = {
      start: 0,
      end: 2000,
      text: 'तुम ही हो',
      words: [
        { text: 'तुम ', start: 0, end: 500 },
        { text: 'ही ', start: 500, end: 900 },
        { text: 'हो', start: 900, end: 1800 },
      ],
    };
    expect(timeWords(line, 'Tum hi ho').map((w) => w.end)).toEqual([500, 900, 1800]);
  });
});

describe('buildDisplayItems', () => {
  it('adds intro and interlude dots', () => {
    const lines: LyricLine[] = [
      { start: 8000, end: 30_000, text: 'First line' },
      { start: 30_000, end: 33_000, text: 'Second line' },
      { start: 33_000, end: 36_000, text: 'Third' },
    ];
    const items = buildDisplayItems(lines, (l) => l.text);
    expect(items.map((i) => i.kind)).toEqual(['gap', 'line', 'gap', 'line', 'line']);
    expect(items[0]).toMatchObject({ start: 0, end: 8000 });
  });
});

describe('progress', () => {
  it('clamps to 0..1', () => {
    expect(progress(500, 1000, 2000)).toBe(0);
    expect(progress(1500, 1000, 2000)).toBe(0.5);
    expect(progress(5000, 1000, 2000)).toBe(1);
  });
});
