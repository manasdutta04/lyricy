export interface MediaLike {
  currentTime: number;
  paused: boolean;
  seeking: boolean;
  readyState: number;
  playbackRate: number;
}

/** Longest stretch we'll extrapolate without a fresh currentTime reading. */
const MAX_EXTRAPOLATE_MS = 400;
const HAVE_FUTURE_DATA = 3;

/**
 * Smooth media clock in ms. `currentTime` can update less often than once per
 * frame, so between updates we extrapolate from the last reading using
 * performance.now() × playbackRate. Freezes while ads play.
 */
export class SyncClock {
  private lastRaw = Number.NaN;
  private anchorMedia = 0;
  private anchorPerf = 0;
  private last = 0;

  constructor(
    private readonly getMedia: () => MediaLike | null,
    private readonly isAdPlaying: () => boolean = () => false,
    private readonly now: () => number = () => performance.now(),
  ) {}

  read(): number {
    const media = this.getMedia();
    if (!media || this.isAdPlaying()) return this.last;

    const raw = media.currentTime * 1000;
    const t = this.now();
    if (raw !== this.lastRaw) {
      this.lastRaw = raw;
      this.anchorMedia = raw;
      this.anchorPerf = t;
    }

    let ms = this.anchorMedia;
    if (!media.paused && !media.seeking && media.readyState >= HAVE_FUTURE_DATA) {
      ms += Math.min(t - this.anchorPerf, MAX_EXTRAPOLATE_MS) * media.playbackRate;
    }
    this.last = ms;
    return ms;
  }
}
