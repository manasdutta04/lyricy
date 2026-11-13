import { useEffect, useMemo, useState } from 'preact/hooks';
import type { TrackSnapshot } from '@/core/agent/protocol';
import { chapterAt } from '@/core/youtube/chapters';

const CHECK_MS = 500;

/**
 * Jukeboxes and medleys hold several songs in one video. When the video has
 * chapters, the song playing is the current chapter: give it its own identity
 * (so it gets its own lyrics) and the time it starts at (so lyrics are timed
 * from the start of that song, not the start of the video).
 */
export function useChapterTrack(
  track: TrackSnapshot | null,
  now: () => number,
): { track: TrackSnapshot | null; startMs: number } {
  const chapters = track?.youtube?.chapters;
  const [index, setIndex] = useState(-1);

  useEffect(() => {
    if (!chapters || chapters.length < 2) {
      setIndex(-1);
      return;
    }
    const update = () => setIndex(chapterAt(chapters, now() / 1000));
    update();
    const timer = setInterval(update, CHECK_MS);
    return () => clearInterval(timer);
  }, [chapters, now]);

  return useMemo(() => {
    const yt = track?.youtube;
    const chapter = chapters && index >= 0 ? chapters[index] : undefined;
    if (!track || !yt || !chapter || !chapters) return { track, startMs: 0 };
    const next = chapters[index + 1];
    const endSec = next?.startSec ?? yt.lengthSec;
    const lengthSec = Math.max(0, Math.round(endSec - chapter.startSec));
    return {
      startMs: chapter.startSec * 1000,
      track: {
        ...track,
        key: `${track.key}#${index}`,
        title: chapter.title,
        durationSec: lengthSec || undefined,
        youtube: {
          ...yt,
          title: chapter.title,
          lengthSec,
          // The "Music in this video" card and captions describe the whole video.
          music: undefined,
          captionTracks: [],
          isChapter: true,
        },
      },
    };
  }, [track, chapters, index]);
}
