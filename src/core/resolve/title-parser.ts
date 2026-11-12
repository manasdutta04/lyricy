import { similarity } from '../match/similarity';

export interface TitleGuess {
  /** Empty when unknown (e.g. uploaded by a label or lyrics channel). */
  artist: string;
  title: string;
  /** "feat." artists pulled out of the title; used for scoring, not searching. */
  featured?: string[];
}

const NOISE_WORDS =
  /\b(official|video|audio|lyrics?|lyrical|mv|m\/v|hd|hq|4k|8k|1080p|720p|visuali[sz]er|remaster(ed)?|music video|full (song|video|audio)|explicit|clean|colou?r coded|eng(lish)? subs?|subtitles?|sub español|topic|out now|premiere|performance video|video song|audio song|new song|latest song)\b/i;

/** Noise phrases removed even when not in brackets. Longest first. */
const NOISE_PHRASES = new RegExp(
  `\\b(${[
    'official\\s+(music\\s+|lyric(al)?\\s+)?(video|audio)',
    'full\\s+(video\\s+|audio\\s+)?song(\\s+with\\s+lyrics)?',
    'full\\s+(video|audio)',
    '(lyric(al)?|lyrics)\\s+video',
    '(video|audio)\\s+song',
    'with\\s+lyrics',
    'music\\s+video',
    '(new|latest)\\s+(hindi\\s+|punjabi\\s+|tamil\\s+|telugu\\s+)?songs?(\\s+\\d{4})?',
    '(hindi|punjabi|bollywood|romantic|sad)\\s+songs?',
    'lyrics',
    'lyrical',
    'visuali[sz]er',
    '(yt\\s+)?shorts?',
    'reels?',
    '(whats\\s*app\\s+)?status',
    'trending|viral',
    '4k|8k|hd|hq',
    '(19|20)\\d{2}\\s*$',
  ].join('|')})\\b`,
  'gi',
);

const BRACKET_GROUP = /[([{【]([^)\]}】]*)[)\]}】]/g;
const FEAT = /[([]?\s*\b(?:feat|ft|featuring)\.?\s+([^()[\]|]+?)\s*(?:[)\]]|(?=\s[-–—|])|$)/i;
const SEGMENT_SPLIT = /\s*[|｜•·]\s*|\s+\/\/\s+/;
const DASH_SPLIT = /\s+[-–—~]\s+/;
const QUOTED = /^(.*?)\s*["“”'‘’]([^"“”'‘’]{2,})["“”'‘’]/;
const CJK_QUOTED = /^(.*?)\s*[「『]([^」』]+)[」』]/;

/** Channels that upload many artists' songs: their name says nothing about the artist. */
const LABEL_CHANNEL =
  /\b(t-?series|sony music|zee music|tips (official|music)|saregama|yrf|speed records|desi melodies|white hill|times music|eros now|shemaroo|venus|aditya music|lahari|think music|sun music|universal music|warner music|atlantic records|coke studio|geet mp3|jjust music|panorama music|vyrl|bollywood|lyrics?|records?|music company|entertainment|films|studios?|productions?|channel|songs?|hits|melod(y|ies)|nation|world)\b/i;

/** Strips channel-name decoration: "Artist - Topic", "ArtistVEVO", "Artist Official". */
export function cleanChannelName(channel: string): string {
  return channel
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/\b(official|music|channel)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The channel's artist name, or '' for labels / lyrics channels. */
export function channelArtist(channel: string): string {
  if (/\s-\s*Topic$/i.test(channel)) return cleanChannelName(channel);
  if (LABEL_CHANNEL.test(channel)) return '';
  return cleanChannelName(channel);
}

function tidy(s: string): string {
  return s
    .replace(NOISE_PHRASES, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:|,]+|[\s\-–—:|,]+$/g, '')
    .trim();
}

const HASHTAG = /#([\p{L}\p{M}\p{N}_]+)/gu;
const JUNK_TAGS =
  /^(shorts?|ytshorts|reels?|trending|viral|fyp|foryou|explore|status|music|song|songs|lyrics?|love|new|hindi|punjabi|bollywood)$/i;

/**
 * Shorts titles are often "Kesariya 🧡 #arijitsingh #shorts". Drop hashtags and emoji;
 * if nothing else is left, fall back to the meaningful hashtags as words.
 */
export function stripHashtagsAndEmoji(title: string): string {
  const tags = [...title.matchAll(HASHTAG)]
    .map((m) => m[1] ?? '')
    .filter((t) => t && !JUNK_TAGS.test(t));
  const rest = title
    .replace(HASHTAG, ' ')
    .replace(/\p{Extended_Pictographic}|️|‍/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return tidy(rest) ? rest : tags.slice(0, 3).join(' ');
}

function splitNames(s: string): string[] {
  return s
    .split(/\s*(?:,|&|\band\b|\bx\b)\s*/i)
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * Turns a YouTube video title + channel into ordered artist/title guesses.
 * The first guess is the most likely; later ones cover swapped "Song - Artist"
 * uploads and film-style "Song | Movie | Singer" titles.
 */
export function parseVideoTitle(rawTitle: string, channel: string): TitleGuess[] {
  let title = stripHashtagsAndEmoji(rawTitle.normalize('NFKC'));

  // Drop bracketed noise like "(Official Music Video)" / "[4K]", keep "(Remix)" etc.
  title = title.replace(BRACKET_GROUP, (group, inner: string) =>
    NOISE_WORDS.test(inner) ? ' ' : group,
  );

  // Pull out "feat. X": it confuses search, but helps pick the right version.
  let featured: string[] = [];
  title = title.replace(FEAT, (_m, names: string) => {
    featured = splitNames(names);
    return ' ';
  });

  // "Song - Artist | Album | Label" → keep the segment that looks like "a - b".
  const segments = title
    .split(SEGMENT_SPLIT)
    .map((s) => s.trim())
    .filter((s) => tidy(s));
  const main = segments.find((s) => DASH_SPLIT.test(s)) ?? segments[0] ?? title;

  const fromChannel = channelArtist(channel);
  const guesses: TitleGuess[] = [];

  const dashParts = main.split(DASH_SPLIT).map(tidy).filter(Boolean);
  const cjk = main.match(CJK_QUOTED);
  const quoted = main.match(QUOTED);

  if (cjk?.[2]) {
    // YOASOBI「アイドル」 / 米津玄師『Lemon』
    guesses.push({ artist: tidy(cjk[1] ?? '') || fromChannel, title: tidy(cjk[2]) });
  } else if (dashParts.length >= 2) {
    const left = dashParts[0] ?? '';
    const right = dashParts.slice(1).join(' - ');
    const artistFirst = { artist: left, title: right, featured };
    const titleFirst = { artist: right, title: left, featured };
    const rightIsChannel = fromChannel ? similarity(right, fromChannel) : 0;
    const leftIsChannel = fromChannel ? similarity(left, fromChannel) : 0;
    if (rightIsChannel > leftIsChannel + 0.2) guesses.push(titleFirst, artistFirst);
    else guesses.push(artistFirst, titleFirst);
  } else if (quoted?.[1] && quoted[2]) {
    guesses.push({ artist: tidy(quoted[1]), title: tidy(quoted[2]), featured });
  }

  const whole = tidy(main.replace(/[「『」』]/g, ' '));
  if (whole) guesses.push({ artist: fromChannel, title: whole, featured });

  // Film/label uploads: "Song - Movie | Actor | Composer | Singer". The singer is
  // usually one of the other segments, so offer them as artists for the song part.
  const songPart = dashParts.length >= 2 ? (dashParts[0] ?? whole) : whole;
  for (const segment of segments.filter((s) => s !== main).slice(0, 5)) {
    const artist = tidy(segment);
    if (artist && songPart && !NOISE_WORDS.test(artist)) guesses.push({ artist, title: songPart });
  }

  const seen = new Set<string>();
  return guesses
    .map((g) => (g.featured?.length ? g : { artist: g.artist, title: g.title }))
    .filter((g) => {
      if (!g.title) return false;
      const key = `${g.artist.toLowerCase()}|${g.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
