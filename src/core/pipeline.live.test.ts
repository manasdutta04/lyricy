/**
 * Real-network smoke test against iTunes + LRCLIB. Skipped by default.
 * Run with: LIVE=1 npx vitest run src/core/pipeline.live.test.ts --reporter=verbose --silent=false
 */
import { describe, expect, it } from 'vitest';
import type { VideoDetails } from './lyrics/types';
import { findLyrics } from './pipeline';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

type Case = Omit<VideoDetails, 'videoId'> & { expect: string[] };

const CASES: Case[] = [
  {
    title: 'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)',
    author: 'Rick Astley',
    lengthSec: 213,
    expect: ['found'],
  },
  {
    title: 'Rama Rama - Rishab Rikhiram Sharma (Official Music Video) | Sitar for Mental Health',
    author: 'Rishab Rikhiram Sharma',
    lengthSec: 395,
    expect: ['found', 'instrumental', 'not-found'],
  },
  {
    title:
      'Kesariya - Brahmāstra | Ranbir Kapoor | Alia Bhatt | Pritam | Arijit Singh | Amitabh Bhattacharya',
    author: 'Sony Music India',
    lengthSec: 171,
    expect: ['found'],
  },
  // Collaborations / duets, credited differently across uploads.
  {
    title: 'Shawn Mendes, Camila Cabello - Señorita',
    author: 'ShawnMendesVEVO',
    lengthSec: 205,
    expect: ['found'],
  },
  {
    title: 'Señorita',
    author: 'Camila Cabello - Topic',
    lengthSec: 191,
    expect: ['found'],
  },
  {
    title: 'Rema, Selena Gomez - Calm Down (Official Music Video)',
    author: 'Rema',
    lengthSec: 239,
    expect: ['found'],
  },
  {
    title: 'Luis Fonsi - Despacito ft. Daddy Yankee',
    author: 'LuisFonsiVEVO',
    lengthSec: 282,
    expect: ['found'],
  },
  {
    title: 'Lady Gaga, Bruno Mars - Die With A Smile (Official Music Video)',
    author: 'Lady Gaga',
    lengthSec: 252,
    expect: ['found'],
  },
  {
    title: 'Die With A Smile',
    author: 'Bruno Mars - Topic',
    lengthSec: 252,
    expect: ['found'],
  },
  {
    title:
      'Apna Bana Le - Full Audio | Bhediya | Varun Dhawan, Kriti Sanon| Sachin-Jigar,Arijit Singh,Amitabh B',
    author: 'Sony Music India',
    lengthSec: 264,
    expect: ['found'],
  },
  {
    title: 'Tum Hi Ho Aashiqui 2 Full Song With Lyrics | Aditya Roy Kapur, Shraddha Kapoor',
    author: 'T-Series',
    lengthSec: 262,
    expect: ['found'],
  },
  {
    title: 'Pehle Bhi Main | Animal | Ranbir Kapoor, Tripti Dimri | Vishal Mishra',
    author: 'T-Series',
    lengthSec: 250,
    expect: ['found'],
  },
  {
    title: 'Arijit Singh & Shreya Ghoshal - Tujhe Kitna Chahne Lage (Lyrics)',
    author: 'Lyrics Hub',
    lengthSec: 285,
    expect: ['found'],
  },
  {
    title: 'Satranga (Lyrics) - Animal | Arijit Singh',
    author: 'Some Lyrics Channel',
    lengthSec: 271,
    expect: ['found'],
  },
  {
    title: 'Diljit Dosanjh x Sia - Hass Hass',
    author: 'Diljit Dosanjh',
    lengthSec: 165,
    expect: ['found'],
  },
  {
    title: 'YOASOBI「アイドル」 Official Music Video',
    author: 'Ayase / YOASOBI',
    lengthSec: 225,
    expect: ['found'],
  },
  {
    title: 'Blinding Lights',
    author: 'The Weeknd - Topic',
    lengthSec: 201,
    expect: ['found'],
  },
];

describe.skipIf(!env?.LIVE)('findLyrics (live)', () => {
  it.each(CASES)('$title', { timeout: 30_000 }, async ({ expect: allowed, ...rest }) => {
    const result = await findLyrics({ videoId: 'live-test', ...rest }, { fetch });
    const summary =
      result.status === 'found'
        ? `${result.track.artist} — ${result.track.title} [${result.lyrics.sync}, ${result.lyrics.lines.length} lines, ${result.confidence.toFixed(2)}] {${result.lyrics.script}/${result.lyrics.romanization}} «${(result.lyrics.lines[0]?.romanized ?? result.lyrics.lines[0]?.text)?.slice(0, 45)}»`
        : JSON.stringify(result);
    console.log(
      `RESULT ${result.status.padEnd(12)} ${rest.title.slice(0, 50).padEnd(50)} → ${summary}`,
    );
    expect(allowed).toContain(result.status);
  });
});
