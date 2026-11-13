import { describe, expect, it } from 'vitest';
import { chapterAt, parseDescriptionChapters } from './chapters';

const SVF = `Presenting Shyama Sangeet from Sadhak Bamakhyapa.

Shomoy Toh Thakbe Na Maa - 00:00
Mon Tor Eto Bhabna Kyano - 04:44
Ami Mantra Tantra Kichhui Jani Ne Maa - 10:47
Ami Ki Emoti Rawbo - 15:41

Follow us on Instagram`;

describe('parseDescriptionChapters', () => {
  it('reads "Title - mm:ss" lists', () => {
    expect(parseDescriptionChapters(SVF, 1433)).toEqual([
      { title: 'Shomoy Toh Thakbe Na Maa', startSec: 0 },
      { title: 'Mon Tor Eto Bhabna Kyano', startSec: 284 },
      { title: 'Ami Mantra Tantra Kichhui Jani Ne Maa', startSec: 647 },
      { title: 'Ami Ki Emoti Rawbo', startSec: 941 },
    ]);
  });

  it('reads "1. mm:ss Title" and h:mm:ss lists', () => {
    const text = '1. 0:00 Tum Hi Ho\n2. 4:22 Sunn Raha Hai\n3. 1:02:05 Chahun Main Ya Naa';
    expect(parseDescriptionChapters(text, 4000).map((c) => [c.startSec, c.title])).toEqual([
      [0, 'Tum Hi Ho'],
      [262, 'Sunn Raha Hai'],
      [3725, 'Chahun Main Ya Naa'],
    ]);
  });

  it('ignores stray timestamps that are not a chapter list', () => {
    expect(parseDescriptionChapters('Premiere at 7:30 tonight!', 300)).toEqual([]);
    expect(parseDescriptionChapters('Drop at 1:20\nChorus at 0:40', 300)).toEqual([]);
    expect(parseDescriptionChapters('A 0:00\nB 9:00', 300)).toEqual([]);
  });
});

describe('chapterAt', () => {
  const chapters = parseDescriptionChapters(SVF, 1433);
  it('finds the chapter playing', () => {
    expect(chapterAt(chapters, 0)).toBe(0);
    expect(chapterAt(chapters, 300)).toBe(1);
    expect(chapterAt(chapters, 1200)).toBe(3);
  });
});
