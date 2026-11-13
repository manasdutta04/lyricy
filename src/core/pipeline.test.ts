import { describe, expect, it } from 'vitest';
import type { VideoDetails } from './lyrics/types';
import { findLyrics, withMusicCard } from './pipeline';
import type { LrclibRecord } from './providers/lrclib';

const VIDEO: VideoDetails = {
  videoId: '-eQEFtrOpNw',
  title: 'Rama Rama - Rishab Rikhiram Sharma (Official Music Video) | Sitar for Mental Health',
  author: 'Rishab Rikhiram Sharma',
  lengthSec: 395,
};

const ITUNES_HIT = {
  kind: 'song',
  trackName: 'Rama Rama',
  artistName: 'Rishab Rikhiram Sharma',
  collectionName: 'Rama Rama - Single',
  trackTimeMillis: 380_000,
  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg',
};

const RECORD: LrclibRecord = {
  id: 1,
  trackName: 'Rama Rama',
  artistName: 'Rishab Rikhiram Sharma',
  albumName: 'Rama Rama - Single',
  duration: 380,
  instrumental: false,
  plainLyrics: 'Line one\nLine two',
  syncedLyrics: '[00:10.00]Line one\n[00:15.00]Line two',
};

type Routes = {
  itunes?: unknown[];
  get?: LrclibRecord | null;
  search?: LrclibRecord[];
  neteaseSongs?: unknown[];
  neteaseLyric?: string;
  saavn?: { results: unknown[]; lyrics?: string };
  ovh?: string;
};

function fakeFetch(routes: Routes) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (url.startsWith('https://itunes.apple.com/')) return json({ results: routes.itunes ?? [] });
    if (url.includes('/api/get?')) return routes.get ? json(routes.get) : json({}, 404);
    if (url.includes('lrclib.net/api/search?')) return json(routes.search ?? []);
    if (url.includes('music.163.com/api/search/get?')) {
      return json({ result: { songs: routes.neteaseSongs ?? [] } });
    }
    if (url.includes('music.163.com/api/song/lyric?')) {
      return json({ lrc: { lyric: routes.neteaseLyric ?? '' } });
    }
    if (url.includes('jiosaavn.com/api.php') && url.includes('search.getResults')) {
      return json({ results: routes.saavn?.results ?? [] });
    }
    if (url.includes('jiosaavn.com/api.php') && url.includes('lyrics.getLyrics')) {
      return json({ lyrics: routes.saavn?.lyrics ?? '' });
    }
    if (url.startsWith('https://api.lyrics.ovh/')) {
      return routes.ovh ? json({ lyrics: routes.ovh }) : json({ error: 'No lyrics found' }, 404);
    }
    return json({}, 404);
  }) as typeof fetch;
  return { fn, calls };
}

describe('findLyrics', () => {
  it('finds synced lyrics via iTunes canonicalization + exact LRCLIB get', async () => {
    const { fn, calls } = fakeFetch({ itunes: [ITUNES_HIT], get: RECORD });
    const result = await findLyrics(VIDEO, { fetch: fn });
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.track.artworkUrl).toContain('600x600bb');
    expect(result.lyrics.sync).toBe('line');
    expect(result.lyrics.lines.map((l) => l.text)).toEqual(['Line one', 'Line two']);
    // Exact hit is good enough: no fuzzy searches.
    expect(calls.some((c) => c.includes('/api/search'))).toBe(false);
  });

  it('falls back to fuzzy search when iTunes has nothing', async () => {
    const { fn } = fakeFetch({ itunes: [], search: [RECORD] });
    const result = await findLyrics(VIDEO, { fetch: fn });
    expect(result.status).toBe('found');
  });

  it('reports instrumental tracks', async () => {
    const { fn } = fakeFetch({
      itunes: [ITUNES_HIT],
      get: { ...RECORD, instrumental: true, plainLyrics: null, syncedLyrics: null },
    });
    expect((await findLyrics(VIDEO, { fetch: fn })).status).toBe('instrumental');
  });

  it('refuses unrelated results', async () => {
    const { fn } = fakeFetch({
      itunes: [],
      search: [
        { ...RECORD, id: 9, trackName: 'Bohemian Rhapsody', artistName: 'Queen', duration: 354 },
      ],
    });
    const result = await findLyrics(VIDEO, { fetch: fn });
    expect(result).toEqual({
      status: 'not-found',
      query: { artist: 'Rishab Rikhiram Sharma', title: 'Rama Rama' },
    });
  });

  it('survives network failures', async () => {
    const failing = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect((await findLyrics(VIDEO, { fetch: failing })).status).toBe('not-found');
  });

  it('uses plain lyrics when no synced version exists', async () => {
    const { fn } = fakeFetch({ itunes: [ITUNES_HIT], get: { ...RECORD, syncedLyrics: null } });
    const result = await findLyrics(VIDEO, { fetch: fn });
    expect(result.status === 'found' && result.lyrics.sync).toBe('none');
  });
});

describe('withMusicCard', () => {
  const base = {
    videoId: 'x',
    title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
    author: 'Rick Astley',
    lengthSec: 213,
  };

  it("puts YouTube's own song identification first when it matches the video", () => {
    const guesses = withMusicCard(
      { ...base, music: { title: 'Never Gonna Give You Up (7" Mix)', artist: 'Rick Astley' } },
      [{ artist: 'Rick Astley', title: 'Never Gonna Give You Up' }],
    );
    expect(guesses[0]).toEqual({
      artist: 'Rick Astley',
      title: 'Never Gonna Give You Up (7" Mix)',
    });
  });

  it('ignores a stale card from the previous video', () => {
    const guesses = withMusicCard(
      { ...base, music: { title: 'Bohemian Rhapsody', artist: 'Queen' } },
      [{ artist: 'Rick Astley', title: 'Never Gonna Give You Up' }],
    );
    expect(guesses).toHaveLength(1);
  });

  it('always trusts YouTube Music metadata', () => {
    const guesses = withMusicCard(
      {
        ...base,
        title: 'Señorita',
        author: 'Shawn Mendes',
        site: 'ytmusic',
        music: { title: 'Señorita', artist: 'Shawn Mendes' },
      },
      [],
    );
    expect(guesses).toEqual([{ artist: 'Shawn Mendes', title: 'Señorita' }]);
  });
});

describe('findLyrics fallbacks', () => {
  const NETEASE_SONG = {
    id: 42,
    name: 'Rama Rama',
    duration: 380_000,
    artists: [{ name: 'Rishab Rikhiram Sharma' }],
    album: { name: 'Rama Rama' },
  };

  it('uses NetEase when LRCLIB has nothing, and drops credit lines', async () => {
    const { fn } = fakeFetch({
      itunes: [ITUNES_HIT],
      neteaseSongs: [NETEASE_SONG],
      neteaseLyric: '[00:00.00] 作词 : Someone\n[00:05.00]First line\n[00:09.00]Second line',
    });
    const result = await findLyrics(VIDEO, { fetch: fn });
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.lyrics.source).toBe('netease');
    expect(result.lyrics.lines.map((l) => l.text)).toEqual(['First line', 'Second line']);
  });

  it("falls back to the video's own captions", async () => {
    const cues = ['One', 'Two', 'Three', 'Four', 'Five'].map((text, i) => ({
      start: i * 3000,
      end: i * 3000 + 2500,
      text,
    }));
    const { fn } = fakeFetch({ itunes: [] });
    const result = await findLyrics(
      { ...VIDEO, captions: { manual: { language: 'en', cues } } },
      { fetch: fn },
    );
    expect(result.status === 'found' && result.lyrics.source).toBe('youtube-captions');
  });

  it('auto-syncs plain lyrics from the web using auto-captions', async () => {
    const lines = [
      'Rama rama jai shri rama',
      'Sita rama jai jai rama',
      'Mangal bhavan amangal haari',
      'Dravahu so dasharath ajir bihari',
    ];
    const words = lines.flatMap((line, i) =>
      line.split(' ').map((w, j) => ({ start: 10_000 + i * 5000 + j * 400, text: w })),
    );
    const { fn } = fakeFetch({ itunes: [ITUNES_HIT], ovh: lines.join('\n') });
    const result = await findLyrics(
      { ...VIDEO, captions: { asr: { language: 'en', words } } },
      { fetch: fn },
    );
    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.lyrics.source).toBe('lyrics.ovh');
    expect(result.lyrics.autoSynced).toBe(true);
    expect(result.lyrics.lines[1]?.start).toBe(15_000);
  });
});

describe('timing against the video', () => {
  const lrc = '[00:10.00]Line one\n[00:15.00]Line two\n[00:20.00]Line three';

  it("prefers the upload timed to this video's length", async () => {
    const { fn } = fakeFetch({
      itunes: [ITUNES_HIT],
      search: [
        { ...RECORD, id: 1, duration: 380, syncedLyrics: lrc },
        { ...RECORD, id: 2, duration: 396, syncedLyrics: lrc },
      ],
    });
    const result = await findLyrics({ ...VIDEO, site: 'youtube' }, { fetch: fn });
    expect(result.status === 'found' && result.lyrics.sourceId).toBe('lrclib:2');
  });

  it('flags lyrics timed for a different cut of the song', async () => {
    const { fn } = fakeFetch({ itunes: [ITUNES_HIT], get: RECORD });
    const edit = { ...VIDEO, lengthSec: 156, site: 'youtube' as const };
    const result = await findLyrics(edit, { fetch: fn });
    expect(result.status === 'found' && result.lyrics.videoMismatch).toEqual({
      videoSec: 156,
      lyricsSec: 380,
    });
  });

  it('does not flag lyrics that fit the video', async () => {
    const { fn } = fakeFetch({ itunes: [ITUNES_HIT], get: RECORD });
    const result = await findLyrics({ ...VIDEO, lengthSec: 383, site: 'youtube' }, { fetch: fn });
    expect(result.status === 'found' && result.lyrics.videoMismatch).toBeUndefined();
  });
});

describe('JioSaavn fallback', () => {
  it('uses JioSaavn plain lyrics when no synced source has the song', async () => {
    const { fn } = fakeFetch({
      itunes: [ITUNES_HIT],
      saavn: {
        results: [
          {
            id: 'abc',
            title: 'Rama Rama',
            more_info: {
              has_lyrics: 'true',
              duration: '380',
              artistMap: { primary_artists: [{ name: 'Rishab Rikhiram Sharma' }] },
            },
          },
        ],
        lyrics: 'Rama rama<br>Jai shri rama',
      },
    });
    const result = await findLyrics(VIDEO, { fetch: fn });
    expect(result.status === 'found' && result.lyrics.source).toBe('jiosaavn');
    expect(result.status === 'found' && result.lyrics.lines.map((l) => l.text)).toEqual([
      'Rama rama',
      'Jai shri rama',
    ]);
  });
});

describe('mixed-script lines', () => {
  it('converts the non-Latin parts of mostly-English lyrics', async () => {
    const { fn } = fakeFetch({
      itunes: [ITUNES_HIT],
      get: {
        ...RECORD,
        syncedLyrics:
          '[00:10.00]Emotional saiyaan\n[00:15.00]Senti মারে, পালটি মারে\n[00:20.00]Love you baby',
      },
    });
    const result = await findLyrics(VIDEO, { fetch: fn });
    if (result.status !== 'found') throw new Error(result.status);
    expect(result.lyrics.lines[1]?.romanized).toBe('Senti mare, palti mare');
    expect(result.lyrics.lines[0]?.romanized).toBeUndefined();
  });
});

describe('re-timing with YouTube captions', () => {
  const lines = [
    'Rama rama jai shri rama',
    'Sita rama jai jai rama',
    'Mangal bhavan amangal haari',
    'Dravahu so dasharath ajir bihari',
  ];
  const studio = lines
    .map((t, i) => `[00:${String(10 + i * 8).padStart(2, '0')}.00]${t}`)
    .join('\n');

  it('re-times lyrics for a different cut when speech captions are available', async () => {
    const words = lines.flatMap((line, i) =>
      line.split(' ').map((w, j) => ({ start: 3_000 + i * 5_000 + j * 300, text: w })),
    );
    const { fn } = fakeFetch({ itunes: [ITUNES_HIT], get: { ...RECORD, syncedLyrics: studio } });
    const result = await findLyrics(
      { ...VIDEO, site: 'youtube', lengthSec: 156, captions: { asr: { language: 'hi', words } } },
      { fetch: fn },
    );
    if (result.status !== 'found') throw new Error(result.status);
    expect(result.lyrics.autoSynced).toBe(true);
    expect(result.lyrics.videoMismatch).toBeUndefined();
    expect(result.lyrics.lines[2]?.start).toBe(13_000);
  });

  it("uses the uploader's captions for alignment when there's no speech track", async () => {
    const cues = lines.map((text, i) => ({
      start: 3_000 + i * 5_000,
      end: 7_000 + i * 5_000,
      text,
    }));
    const { fn } = fakeFetch({ itunes: [ITUNES_HIT], get: { ...RECORD, syncedLyrics: studio } });
    const result = await findLyrics(
      { ...VIDEO, site: 'youtube', lengthSec: 156, captions: { manual: { language: 'hi', cues } } },
      { fetch: fn },
    );
    if (result.status !== 'found') throw new Error(result.status);
    expect(result.lyrics.autoSynced).toBe(true);
    expect(result.lyrics.lines[1]?.start).toBe(8_000);
  });
});

describe('auto-generated captions as lyrics', () => {
  it('uses them when no source has the song, in English letters', async () => {
    const cues = ['राम राम जय', 'सीता राम', 'मंगल भवन', 'अमंगल हारी'].map((text, i) => ({
      start: i * 3000,
      end: i * 3000 + 2500,
      text,
    }));
    const words = cues.flatMap((c) => c.text.split(' ').map((w) => ({ start: c.start, text: w })));
    const { fn } = fakeFetch({ itunes: [] });
    const result = await findLyrics(
      { ...VIDEO, site: 'youtube', captions: { asr: { language: 'hi', words, cues } } },
      { fetch: fn },
    );
    if (result.status !== 'found') throw new Error(result.status);
    expect(result.lyrics.source).toBe('youtube-captions');
    expect(result.lyrics.autoCaptions).toBe(true);
    expect(result.lyrics.lines[1]?.romanized).toBe('Sita ram');
  });
});

describe("captions in the song's own script", () => {
  it('shows a Bengali song in Bengali letters even when captions came in Hindi letters', async () => {
    const cues = ['मंत्र तंत्र', 'कुछ नहीं', 'जानी ना', 'माँ'].map((text, i) => ({
      start: i * 3000,
      end: i * 3000 + 2500,
      text,
    }));
    const { fn } = fakeFetch({ itunes: [] });
    const result = await findLyrics(
      {
        ...VIDEO,
        title: 'Ami Mantra Tantra Kichhui Janine Ma (আমি মন্ত্র তন্ত্র) | Sadhak Bamakhyapa | SVF',
        author: 'SVF',
        site: 'youtube',
        captions: { asr: { language: 'hi', words: [], cues } },
      },
      { fetch: fn },
    );
    if (result.status !== 'found') throw new Error(result.status);
    expect(result.lyrics.script).toBe('bengali');
    expect(result.lyrics.lines[0]?.text).toBe('মংত্র তংত্র');
    expect(result.lyrics.lines[1]?.romanized).toBe('Kuchh nahi');
  });
});
