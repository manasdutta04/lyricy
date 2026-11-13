import { describe, expect, it } from 'vitest';
import type { TrackSnapshot } from '@/core/agent/protocol';
import { captionsAllowed, toVideoDetails } from './use-lyrics';

const base: TrackSnapshot = {
  key: 'Z21oUFT9VbM',
  title: 'Sadhak Bamakhyapa - Shyama Sangeet Audio Jukebox',
  artist: 'SVF',
  youtube: { videoId: 'Z21oUFT9VbM', title: 'Sadhak Bamakhyapa', author: 'SVF', lengthSec: 1433 },
};

describe('toVideoDetails', () => {
  it('gives each jukebox chapter its own cache key', () => {
    const chapter = (i: number, title: string): TrackSnapshot => ({
      ...base,
      key: `Z21oUFT9VbM#${i}`,
      title,
      youtube: {
        ...(base.youtube as NonNullable<TrackSnapshot['youtube']>),
        title,
        isChapter: true,
      },
    });
    const two = toVideoDetails(chapter(1, 'Mon Tor Eto Bhabna Kyano'), 'youtube', null);
    const three = toVideoDetails(
      chapter(2, 'Ami Mantra Tantra Kichhui Jani Ne Maa'),
      'youtube',
      null,
    );
    expect(two.videoId).toBe('Z21oUFT9VbM#1');
    expect(three.videoId).toBe('Z21oUFT9VbM#2');
    expect(two.title).toBe('Mon Tor Eto Bhabna Kyano');
  });

  it('keeps the plain video id for normal videos', () => {
    expect(toVideoDetails(base, 'youtube', null).videoId).toBe('Z21oUFT9VbM');
  });
});

describe('captionsAllowed', () => {
  const yt = base.youtube as NonNullable<TrackSnapshot['youtube']>;
  it('uses captions for songs, including songs filed under films', () => {
    expect(captionsAllowed({ ...yt, category: 'Music' })).toBe(true);
    expect(captionsAllowed({ ...yt, category: 'Film & Animation' })).toBe(true);
    expect(
      captionsAllowed({ ...yt, category: 'Education', music: { title: 'a', artist: 'b' } }),
    ).toBe(true);
  });
  it("never shows a lecture's subtitles as lyrics", () => {
    expect(captionsAllowed({ ...yt, category: 'Education' })).toBe(false);
    expect(captionsAllowed(undefined)).toBe(false);
  });
});
