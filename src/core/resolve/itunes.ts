import type { TrackInfo } from '../lyrics/types';

export type FetchFn = typeof fetch;

interface ItunesResult {
  wrapperType?: string;
  kind?: string;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  trackTimeMillis?: number;
  artworkUrl100?: string;
}

/** Free, keyless iTunes Search API → canonical song metadata + artwork. */
export async function searchItunes(
  term: string,
  fetchFn: FetchFn,
  limit = 10,
): Promise<TrackInfo[]> {
  const params = new URLSearchParams({
    term,
    media: 'music',
    entity: 'song',
    limit: String(limit),
  });
  const res = await fetchFn(`https://itunes.apple.com/search?${params}`);
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);
  const body = (await res.json()) as { results?: ItunesResult[] };

  return (body.results ?? [])
    .filter((r) => r.kind === 'song' && r.trackName && r.artistName)
    .map((r) => ({
      artist: r.artistName ?? '',
      title: r.trackName ?? '',
      album: r.collectionName,
      durationSec: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : undefined,
      artworkUrl: r.artworkUrl100?.replace(/\/\d+x\d+bb\./, '/600x600bb.'),
    }));
}
