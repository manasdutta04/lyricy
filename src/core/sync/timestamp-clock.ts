export interface TimedPosition {
  positionMs: number;
  playing: boolean;
  rate: number;
  ad: boolean;
  /** Date.now() when positionMs was read in the page. */
  at: number;
}

/** Never extrapolate further than this past the last report (tab hidden, page stalled). */
const MAX_EXTRAPOLATE_MS = 1500;
/** Tiny backwards corrections are jitter, not seeks: hold instead of stepping back. */
const JITTER_MS = 120;

/**
 * Playback clock for the side panel. Each report from the page carries the exact
 * moment the position was read, so we extrapolate from *that* moment rather than
 * from when the message arrived. This removes polling and messaging delay, so
 * lyrics land on the beat instead of a few hundred milliseconds late.
 */
export class TimestampClock {
  private last = 0;

  constructor(
    private readonly getPosition: () => TimedPosition | null,
    private readonly wallClock: () => number = () => Date.now(),
  ) {}

  read(): number {
    const p = this.getPosition();
    // During an ad the position is the ad's, not the song's: hold where we were.
    if (!p || p.ad) return this.last;
    let ms = p.positionMs;
    if (p.playing) {
      const elapsed = Math.min(Math.max(0, this.wallClock() - p.at), MAX_EXTRAPOLATE_MS);
      ms += elapsed * p.rate;
    }
    // Hold through tiny backward wobbles while playing; follow real seeks immediately.
    if (p.playing && ms < this.last && this.last - ms < JITTER_MS) return this.last;
    this.last = ms;
    return ms;
  }
}
