import type { LyricsResult, VideoDetails } from './lyrics/types';

export interface FindLyricsMessage {
  type: 'lyrics:find';
  video: VideoDetails;
  /** Skip the cache (retry button). */
  force?: boolean;
}

export function isFindLyricsMessage(msg: unknown): msg is FindLyricsMessage {
  return (
    typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'lyrics:find'
  );
}

/** Content script → background. */
export async function requestLyrics(video: VideoDetails, force = false): Promise<LyricsResult> {
  const message: FindLyricsMessage = { type: 'lyrics:find', video, force };
  const result = (await browser.runtime.sendMessage(message)) as LyricsResult | undefined;
  return result ?? { status: 'error', message: 'No response from background' };
}
