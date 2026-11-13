import { describe, expect, it } from 'vitest';
import { type TimedPosition, TimestampClock } from './timestamp-clock';

function setup(initial: TimedPosition) {
  let position: TimedPosition | null = initial;
  let wall = initial.at;
  const clock = new TimestampClock(
    () => position,
    () => wall,
  );
  return {
    clock,
    set: (p: TimedPosition) => {
      position = p;
    },
    tick: (ms: number) => {
      wall += ms;
    },
  };
}

const base: TimedPosition = { positionMs: 10_000, playing: true, rate: 1, ad: false, at: 1_000 };

describe('TimestampClock', () => {
  it('extrapolates from when the page read the position, not when it arrived', () => {
    const { clock, tick } = setup(base);
    tick(300); // report arrived 300 ms after it was taken
    expect(clock.read()).toBe(10_300);
  });

  it('respects playback rate and pauses', () => {
    const { clock, set, tick } = setup({ ...base, rate: 1.5 });
    tick(200);
    expect(clock.read()).toBe(10_300);
    set({ ...base, playing: false, positionMs: 12_000, at: 1_200 });
    tick(5_000);
    expect(clock.read()).toBe(12_000);
  });

  it('holds through tiny backward jitter but follows seeks', () => {
    const { clock, set, tick } = setup(base);
    tick(250);
    expect(clock.read()).toBe(10_250);
    set({ ...base, positionMs: 10_180, at: 1_250 }); // 70 ms "behind": jitter
    expect(clock.read()).toBe(10_250);
    set({ ...base, positionMs: 2_000, at: 1_250 }); // user seeked back
    expect(clock.read()).toBe(2_000);
  });

  it('freezes during ads and caps extrapolation', () => {
    const { clock, set, tick } = setup(base);
    tick(10_000);
    expect(clock.read()).toBe(11_500);
    set({ ...base, ad: true, positionMs: 3_000, at: 11_000 });
    expect(clock.read()).toBe(11_500);
  });
});
