export interface Chapter {
  title: string;
  startSec: number;
}

const TIMESTAMP = /(?<!\d)(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?!\d)/;

function toSeconds(m: RegExpMatchArray): number {
  const [, h, mm, ss] = m;
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss);
}

/** Strips the timestamp, numbering and separators from a chapter line. */
function chapterTitle(line: string, stamp: string): string {
  return line
    .replace(stamp, ' ')
    .replace(/^\s*(?:\d{1,2}[.)]|[-–—•·▶►✓*#]+)\s*/, '')
    .replace(/^[\s\-–—:|•·()[\]]+|[\s\-–—:|•·()[\]]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chapters from a video description's timestamp list, as used by jukeboxes and
 * medleys ("Mon Tor Eto Bhabna Kyano - 04:44" or "04:44 Mon Tor Eto Bhabna Kyano").
 * Returns [] unless it looks like a real chapter list: at least two entries,
 * starting near 0:00, ascending, and within the video length.
 */
export function parseDescriptionChapters(description: string, lengthSec: number): Chapter[] {
  const chapters: Chapter[] = [];
  for (const line of description.split(/\r?\n/)) {
    const m = line.match(TIMESTAMP);
    if (!m) continue;
    const startSec = toSeconds(m);
    const title = chapterTitle(line, m[0]);
    if (!title || /^\d+$/.test(title)) continue;
    chapters.push({ title, startSec });
  }
  if (chapters.length < 2) return [];
  if ((chapters[0]?.startSec ?? 99) > 15) return [];
  for (let i = 1; i < chapters.length; i++) {
    if ((chapters[i]?.startSec ?? 0) <= (chapters[i - 1]?.startSec ?? 0)) return [];
  }
  if (lengthSec > 0 && (chapters[chapters.length - 1]?.startSec ?? 0) >= lengthSec) return [];
  return chapters;
}

/** Index of the chapter playing at `positionSec` (-1 before the first). */
export function chapterAt(chapters: readonly Chapter[], positionSec: number): number {
  let index = -1;
  for (let i = 0; i < chapters.length; i++) {
    if ((chapters[i]?.startSec ?? 0) <= positionSec + 0.25) index = i;
    else break;
  }
  return index;
}
