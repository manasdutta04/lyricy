/**
 * Many uploads (especially Indian labels) paste the full lyrics into the video
 * description under a "Lyrics:" heading. Those are the exact words of this
 * recording, so they make a good source when no lyrics site has the song.
 */

/**
 * A heading line on its own: "Lyrics :", "Song Lyrics -", "Lyrics in English:",
 * "গানের কথা:", "गीत के बोल:", "ਬੋਲ:". A line like "Lyrics : Gulzar" is a credit, not a heading.
 */
const HEADING =
  /^\s*[-–—*•#|\s]*(?:(?:full\s+|song\s+|original\s+)?lyrics?(?:\s+in\s+[\p{L}]+)?|গানের\s*কথা|কথা|गीत\s*के\s*बोल|गाने\s*के\s*बोल|बोल|ਬੋਲ|ગીત)\s*[:：\-–—]*\s*[-–—*•|\s]*$/iu;

/** Where the lyrics block ends: separators, links, hashtags, credits, calls to action. */
const STOP =
  /^\s*(?:[-–—_=*~•►▶➤✦◆♦#]{3,}|[►▶➤🔔👉📌✅]|#\p{L}|https?:\/\/|www\.|@\p{L}|[©℗]|(?:subscribe\b|follow\s+us|like\s+us|stay\s+connected|enjoy\s+and\s+stay|share\s+(?:this|with)|(?:also\s+)?watch\s+(?:the\s+full|full|more|now|also)|(?:listen|stream)\s+(?:on|now|here)|download\s|available\s+on|credits?\s*[:：]?\s*$|credit\s+list|music\s+label|copyright|for\s+(?:more|business)|click\s+(?:here|the|to)))/iu;

const MIN_LINES = 4;
const MAX_LINES = 160;

/** The lyrics block in a video description, if it has one (lines joined by "\n"). */
export function parseDescriptionLyrics(description: string): string | undefined {
  if (!description) return undefined;
  const lines = description.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!HEADING.test(lines[i] ?? '')) continue;
    const block: string[] = [];
    let blankRun = 0;
    for (let j = i + 1; j < lines.length && block.length < MAX_LINES; j++) {
      const line = (lines[j] ?? '').trim();
      if (!line) {
        // Lyrics come in stanzas; a long run of blank lines ends the block.
        if (block.length && ++blankRun >= 3) break;
        if (block.length) block.push('');
        continue;
      }
      blankRun = 0;
      if (STOP.test(line)) break;
      // A "Singer: X" style credit right after the heading means this wasn't lyrics.
      if (/^[\p{L} ]{2,30}\s*[:：]\s*\S/u.test(line) && block.filter(Boolean).length === 0) break;
      block.push(line);
    }
    const text = block.join('\n').trim();
    if (text.split('\n').filter(Boolean).length >= MIN_LINES) return text;
  }
  return undefined;
}
