import { describe, expect, it } from 'vitest';
import { findActiveIndex } from './active-line';
import { type MediaLike, SyncClock } from './clock';

describe('findActiveIndex', () => {
  const lines = [1000, 2000, 5000].map((start) => ({ start, end: start + 500, text: '' }));
  it.each([
    [0, -1],
    [999, -1],
    [1000, 0],
    [1999, 0],
    [2000, 1],
    [4999, 1],
    [99999, 2],
  ])('%i ms → %i', (ms, expected) => {
    expect(findActiveIndex(lines, ms)).toBe(expected);
  });
  it('handles empty input', () => {
    expect(findActiveIndex([], 100)).toBe(-1);
  });
});

describe('SyncClock', () => {
  function setup() {
    const media: MediaLike = {
      currentTime: 10,
      paused: false,
      seeking: false,
      readyState: 4,
      playbackRate: 1,
    };
    let now = 0;
    let ad = false;
    const clock = new SyncClock(
      () => media,
      () => ad,
      () => now,
    );
    return {
      media,
      clock,
      advance: (ms: number) => {
        now += ms;
      },
      setAd: (v: boolean) => {
        ad = v;
      },
    };
  }

  it('extrapolates between currentTime updates', () => {
    const { clock, advance } = setup();
    expect(clock.read()).toBe(10_000);
    advance(100);
    expect(clock.read()).toBe(10_100);
  });

  it('re-anchors when currentTime changes and respects playbackRate', () => {
    const { clock, media, advance } = setup();
    clock.read();
    media.currentTime = 20;
    media.playbackRate = 2;
    advance(50);
    expect(clock.read()).toBe(20_000);
    advance(100);
    expect(clock.read()).toBe(20_200);
  });

  it('does not run ahead while paused, and caps extrapolation', () => {
    const { clock, media, advance } = setup();
    clock.read();
    advance(5000);
    expect(clock.read()).toBe(10_400);
    media.paused = true;
    media.currentTime = 11;
    advance(1000);
    expect(clock.read()).toBe(11_000);
  });

  it('freezes during ads', () => {
    const { clock, media, setAd } = setup();
    expect(clock.read()).toBe(10_000);
    setAd(true);
    media.currentTime = 3;
    expect(clock.read()).toBe(10_000);
  });
});
