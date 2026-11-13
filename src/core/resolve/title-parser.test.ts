import { describe, expect, it } from 'vitest';
import {
  channelArtist,
  cleanChannelName,
  parseVideoTitle,
  stripHashtagsAndEmoji,
} from './title-parser';

describe('parseVideoTitle', () => {
  it('uses the channel to detect "Song - Artist" order', () => {
    const [first] = parseVideoTitle(
      'Rama Rama - Rishab Rikhiram Sharma (Official Music Video) | Sitar for Mental Health',
      'Rishab Rikhiram Sharma',
    );
    expect(first).toEqual({ artist: 'Rishab Rikhiram Sharma', title: 'Rama Rama' });
  });

  it('defaults to "Artist - Song" and strips noise', () => {
    const [first, second] = parseVideoTitle(
      'Rick Astley - Never Gonna Give You Up (Official Music Video) [4K Remaster]',
      'Rick Astley',
    );
    expect(first).toEqual({ artist: 'Rick Astley', title: 'Never Gonna Give You Up' });
    expect(second).toEqual({ artist: 'Never Gonna Give You Up', title: 'Rick Astley' });
  });

  it('removes featured artists', () => {
    const [first] = parseVideoTitle(
      'Calvin Harris - Feels (feat. Pharrell Williams) (Official)',
      'CalvinHarrisVEVO',
    );
    expect(first).toEqual({
      artist: 'Calvin Harris',
      title: 'Feels',
      featured: ['Pharrell Williams'],
    });
  });

  it('strips unbracketed noise and ignores label channels', () => {
    const guesses = parseVideoTitle(
      'Tum Hi Ho Aashiqui 2 Full Song With Lyrics | Aditya Roy Kapur, Shraddha Kapoor',
      'T-Series',
    );
    expect(guesses[0]).toEqual({ artist: '', title: 'Tum Hi Ho Aashiqui 2' });
  });

  it('cleans Shorts-style titles with hashtags and emoji', () => {
    const [first] = parseVideoTitle('Kesariya 🧡 #arijitsingh #shorts #trending', 'Some Fan');
    expect(first?.title).toBe('Kesariya');
    expect(stripHashtagsAndEmoji('#kesariya #shorts')).toBe('kesariya');
  });

  it('handles "Film: Song (Song) | credits" label uploads', () => {
    const guesses = parseVideoTitle(
      'Ramayana: Mangal Rang (Song) | Namit M, Nitesh T | AR Rahman, Arijit Singh, Shreya Ghoshal, Kumar V',
      'T-Series',
    );
    expect(guesses[0]).toEqual({ artist: '', title: 'Mangal Rang' });
    expect(guesses).toContainEqual({ artist: 'Arijit Singh', title: 'Mangal Rang' });
    expect(guesses).toContainEqual({
      artist: 'AR Rahman, Arijit Singh, Shreya Ghoshal, Kumar V',
      title: 'Mangal Rang',
    });
  });

  it('treats names after a colon as singers', () => {
    const [first] = parseVideoTitle(
      'Sahiba (Official Music Video) : Aditya Rikhari, Ankita Chhetri | T-Series',
      'T-Series',
    );
    expect(first).toEqual({ artist: 'Aditya Rikhari, Ankita Chhetri', title: 'Sahiba' });
  });

  it('splits capital-I separators and drops a trailing "Song"', () => {
    const guesses = parseVideoTitle(
      'Diljit Dosanjh I Sanya Malhotra I Charmer | Raj Ranjodh | Avvy Sra ( Official Video )',
      'Diljit Dosanjh',
    );
    expect(guesses.map((g) => g.title)).toContain('Charmer');
    const [besharam] = parseVideoTitle('Besharam Rang Song | Pathaan | Shah Rukh Khan', 'YRF');
    expect(besharam?.title).toBe('Besharam Rang');
  });

  it('drops native-script duplicates and noise in Bengali titles', () => {
    const [first] = parseVideoTitle(
      'Bojhena Shey Bojhena (বোঝেনা সে বোঝেনা) | Title Track |Soham |Abir | Payel |Mimi | Arijit Singh |SVF',
      'SVF',
    );
    expect(first?.title).toBe('Bojhena Shey Bojhena');
    const [bhromor] = parseVideoTitle(
      'BHROMOR ভিডিও গান | অফিসিয়াল | Praktan বাংলা মুভি | Surojit চট্টোপাধ্যায়',
      'Amara Muzik Bengali',
    );
    expect(bhromor?.title).toBe('BHROMOR');
  });

  it('keeps the first part as the song when a later part is "Artist - Uploader"', () => {
    const guesses = parseVideoTitle(
      'Jabo Na Jabo Na Phire | Reprise Version | যাবো না যাবো নাফিরে আর ঘরে || Arijit Singh - DjSumanRaJ',
      'Dj Suman Raj',
    );
    expect(guesses[0]?.title).toBe('Jabo Na Jabo Na Phire');
    expect(guesses).toContainEqual({ artist: 'Arijit Singh', title: 'Jabo Na Jabo Na Phire' });
  });

  it('drops (From "Film") from the searched title', () => {
    const [first] = parseVideoTitle('Arijit Singh - Kesariya (From "Brahmastra")', 'Arijit Singh');
    expect(first).toEqual({ artist: 'Arijit Singh', title: 'Kesariya' });
  });

  it('reads Japanese 「」 titles', () => {
    const [first] = parseVideoTitle('YOASOBI「アイドル」 Official Music Video', 'Ayase / YOASOBI');
    expect(first).toEqual({ artist: 'YOASOBI', title: 'アイドル' });
  });

  it('handles "Song (Lyrics) - Movie | Singer" from lyrics channels', () => {
    const guesses = parseVideoTitle(
      'Satranga (Lyrics) - Animal | Arijit Singh',
      'Some Lyrics Channel',
    );
    expect(guesses).toContainEqual({ artist: 'Arijit Singh', title: 'Satranga' });
  });

  it('keeps meaningful brackets like Remix', () => {
    const [first] = parseVideoTitle('Artist - Song (Acoustic Remix)', 'Artist');
    expect(first?.title).toBe('Song (Acoustic Remix)');
  });

  it('does not split hyphenated names without spaces', () => {
    const [first] = parseVideoTitle('Jay-Z - Empire State of Mind', 'JayZVEVO');
    expect(first).toEqual({ artist: 'Jay-Z', title: 'Empire State of Mind' });
  });

  it('falls back to channel as artist for Topic uploads', () => {
    expect(parseVideoTitle('Kesariya', 'Arijit Singh - Topic')).toEqual([
      { artist: 'Arijit Singh', title: 'Kesariya' },
    ]);
  });

  it('handles quoted titles', () => {
    const [first] = parseVideoTitle('Taylor Swift "Anti-Hero" Official Video', 'TaylorSwiftVEVO');
    expect(first).toEqual({ artist: 'Taylor Swift', title: 'Anti-Hero' });
  });

  it('offers other segments as artists for film-style titles', () => {
    const guesses = parseVideoTitle(
      'Kesariya - Brahmāstra | Ranbir Kapoor | Pritam | Arijit Singh',
      'Sony Music India',
    );
    expect(guesses).toContainEqual({ artist: 'Arijit Singh', title: 'Kesariya' });
  });

  it('strips trailing noise without brackets', () => {
    const [first] = parseVideoTitle('Artist - Song Official Video', 'Artist');
    expect(first).toEqual({ artist: 'Artist', title: 'Song' });
  });
});

describe('cleanChannelName', () => {
  it.each([
    ['Arijit Singh - Topic', 'Arijit Singh'],
    ['TaylorSwiftVEVO', 'TaylorSwift'],
    ['Coldplay Official', 'Coldplay'],
  ])('%s → %s', (input, expected) => {
    expect(cleanChannelName(input)).toBe(expected);
  });
});

describe('Bengali label channels', () => {
  it('does not treat SVF or Amara Muzik as the artist', () => {
    expect(channelArtist('SVF')).toBe('');
    expect(channelArtist('Amara Muzik Bengali')).toBe('');
    expect(channelArtist('Anupam Roy')).toBe('Anupam Roy');
  });
});
