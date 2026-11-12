import { describe, expect, it } from 'vitest';
import { parseLrc, parsePlain } from './lrc';

describe('parseLrc', () => {
  it('parses basic lines and derives end times from the next line', () => {
    const lines = parseLrc('[ar:Someone]\n[00:01.50]First\n[00:04.00]Second\n[00:07.25]Third');
    expect(lines).toEqual([
      { start: 1500, end: 4000, text: 'First' },
      { start: 4000, end: 7250, text: 'Second' },
      { start: 7250, end: 12250, text: 'Third' },
    ]);
  });

  it('uses blank timed lines to end the previous line', () => {
    const lines = parseLrc('[00:01.00]Hello\n[00:03.00]\n[00:10.00]Again');
    expect(lines[0]).toEqual({ start: 1000, end: 3000, text: 'Hello' });
    expect(lines).toHaveLength(2);
  });

  it('expands repeated timestamps and sorts', () => {
    const lines = parseLrc('[00:20.00][00:05.00]Chorus\n[00:10.00]Verse');
    expect(lines.map((l) => [l.start, l.text])).toEqual([
      [5000, 'Chorus'],
      [10000, 'Verse'],
      [20000, 'Chorus'],
    ]);
  });

  it('caps the last line by song duration', () => {
    const lines = parseLrc('[00:01.00]Only', 4000);
    expect(lines[0]?.end).toBe(4000);
  });

  it('applies the offset tag', () => {
    const lines = parseLrc('[offset:+500]\n[00:02.00]Early');
    expect(lines[0]?.start).toBe(1500);
  });

  it('accepts 3-digit fractions and colon decimals', () => {
    const lines = parseLrc('[00:01.123]A\n[00:02:50]B');
    expect(lines.map((l) => l.start)).toEqual([1123, 2500]);
  });

  it('parses enhanced word timing', () => {
    const [line] = parseLrc('[00:01.00]<00:01.00>Hello <00:01.60>world<00:02.20>\n[00:03.00]x');
    expect(line?.text).toBe('Hello world');
    expect(line?.words).toEqual([
      { text: 'Hello ', start: 1000, end: 1600 },
      { text: 'world', start: 1600, end: 2200 },
    ]);
  });
});

describe('parsePlain', () => {
  it('drops blank lines', () => {
    expect(parsePlain('a\n\n b \n').map((l) => l.text)).toEqual(['a', 'b']);
  });
});
