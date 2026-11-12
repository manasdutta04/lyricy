import type { FetchFn } from '../resolve/itunes';

/** lyrics.ovh: plain-text lyrics by exact artist + title (last-resort web source). */
export async function lyricsOvh(
  artist: string,
  title: string,
  fetchFn: FetchFn,
): Promise<string | null> {
  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  const res = await fetchFn(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`lyrics.ovh failed: ${res.status}`);
  const body = (await res.json()) as { lyrics?: string };
  const lyrics = body.lyrics
    ?.replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // The API sometimes prefixes "Paroles de la chanson … par …".
  return lyrics ? lyrics.replace(/^Paroles de la chanson.*\n/i, '') : null;
}
