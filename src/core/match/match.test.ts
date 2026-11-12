import { describe, expect, it } from 'vitest';
import { durationScore, scoreCandidate, versionPenalty } from './score';
import { artistSimilarity, normalize, similarity, splitArtists } from './similarity';

describe('normalize', () => {
  it('folds accents, case, brackets and feat tails', () => {
    expect(normalize('Beyoncé – Halo (Live) feat. Someone')).toBe('beyonce halo');
  });
  it('keeps Devanagari vowel signs and CJK', () => {
    expect(normalize('राम राम')).toBe('राम राम');
    expect(normalize('米津玄師「Lemon」')).toBe('米津玄師');
  });
});

describe('similarity', () => {
  it('is 1 for equivalent strings and low for unrelated ones', () => {
    expect(similarity('Never Gonna Give You Up', 'never gonna give you up!')).toBe(1);
    expect(similarity('Never Gonna Give You Up', 'Bohemian Rhapsody')).toBeLessThan(0.3);
  });
  it('tolerates small typos', () => {
    expect(similarity('Rishab Rikhiram Sharma', 'Rishab Rikhi Ram Sharma')).toBeGreaterThan(0.8);
  });
});

describe('artistSimilarity', () => {
  it('matches one member of a collaboration', () => {
    expect(splitArtists('Calvin Harris, Dua Lipa & Young Thug')).toHaveLength(3);
    expect(artistSimilarity('Calvin Harris, Dua Lipa', 'Dua Lipa')).toBeGreaterThan(0.9);
  });
});

describe('scoreCandidate', () => {
  const query = { artist: 'Rick Astley', title: 'Never Gonna Give You Up', durationSec: 213 };

  it('scores the right song highly', () => {
    const score = scoreCandidate(
      { ...query, durationKind: 'tight' },
      { artist: 'Rick Astley', title: 'Never Gonna Give You Up', durationSec: 214, synced: true },
    );
    expect(score).toBeGreaterThan(0.95);
  });

  it('penalizes a wrong song by the same artist', () => {
    const score = scoreCandidate(query, {
      artist: 'Rick Astley',
      title: 'Together Forever',
      durationSec: 200,
      synced: true,
    });
    expect(score).toBeLessThan(0.7);
  });

  it('accepts swapped artist/title at a discount', () => {
    const swapped = scoreCandidate(
      { artist: 'Never Gonna Give You Up', title: 'Rick Astley' },
      { artist: 'Rick Astley', title: 'Never Gonna Give You Up', synced: true },
    );
    expect(swapped).toBeGreaterThan(0.7);
  });
});

describe('versionPenalty', () => {
  it('penalizes versions only one side mentions', () => {
    expect(versionPenalty('Kesariya Arijit Singh', 'Kesariya (From "Brahmastra")')).toBe(0);
    expect(
      versionPenalty('Kesariya Arijit Singh', 'Kesariya (Dance Mix) [From "Brahmastra"]'),
    ).toBeGreaterThan(0);
    expect(versionPenalty('Song (Acoustic) Artist', 'Song - Acoustic')).toBe(0);
    expect(versionPenalty('Song Artist', 'Song (Live at Wembley)')).toBeGreaterThan(0);
  });

  it('prefers the original over a remix with identical base title', () => {
    const q = { artist: 'Arijit Singh', title: 'Kesariya' };
    const original = scoreCandidate(q, {
      artist: 'Arijit Singh',
      title: 'Kesariya (From "Brahmastra")',
      synced: true,
    });
    const remix = scoreCandidate(q, {
      artist: 'Arijit Singh',
      title: 'Kesariya (Dance Mix)',
      synced: true,
    });
    expect(original).toBeGreaterThan(remix);
  });
});

describe('durationScore', () => {
  it('is strict for canonical durations and lenient for video lengths', () => {
    const c = { artist: '', title: '', durationSec: 200 };
    expect(
      durationScore({ artist: '', title: '', durationSec: 210, durationKind: 'tight' }, c),
    ).toBeLessThan(0.7);
    expect(
      durationScore({ artist: '', title: '', durationSec: 210, durationKind: 'loose' }, c),
    ).toBeGreaterThan(0.8);
  });
});
