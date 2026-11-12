import { useEffect, useState } from 'preact/hooks';
import { SOURCE_LABELS } from '@/core/lyrics/types';
import { LyricsView, type Playback } from './LyricsView';
import { type LyricsState, trackOf } from './use-lyrics';

interface Props {
  state: LyricsState;
  playback: Playback;
  isShorts?: boolean;
  /** Manual timing nudge (ms) for the current track. */
  userOffset: number;
  onNudge: (deltaMs: number) => void;
  onRetry: () => void;
  onSearchAnyway: () => void;
}

function Dots() {
  return (
    <div class="dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

/** The lyrics card: artwork header, lyrics or status, source + timing footer. */
export function LyricsSurface({
  state,
  playback,
  isShorts,
  userOffset,
  onNudge,
  onRetry,
  onSearchAnyway,
}: Props) {
  const [artFailed, setArtFailed] = useState(false);
  const track = trackOf(state);
  const playing = state.phase === 'idle' ? null : state.track;
  const artworkCandidate =
    track?.artworkUrl ??
    playing?.artworkUrl ??
    (playing?.youtube
      ? `https://i.ytimg.com/vi/${playing.youtube.videoId}/hqdefault.jpg`
      : undefined);
  useEffect(() => setArtFailed(false), [artworkCandidate]);

  if (state.phase === 'idle' || !playing) return null;

  const artwork = artFailed ? undefined : artworkCandidate;
  const heading = track?.title ?? playing.youtube?.music?.title ?? playing.title;
  const subheading = track?.artist ?? playing.youtube?.music?.artist ?? playing.artist;
  const found = state.phase === 'done' && state.result.status === 'found' ? state.result : null;
  const synced = found && found.lyrics.sync !== 'none' && !isShorts;

  let timing = '';
  if (found) {
    if (isShorts) timing = 'Not synced (Short)';
    else if (found.lyrics.sync === 'none') timing = 'Not synced';
    else if (found.lyrics.autoSynced) timing = 'Auto-synced';
    else if (found.lyrics.offsetMs)
      timing = `Matched to video (${found.lyrics.offsetMs > 0 ? '+' : ''}${(found.lyrics.offsetMs / 1000).toFixed(1)}s)`;
    else timing = 'Synced';
  }

  return (
    <section class="panel" aria-label="Lyrics">
      {artwork && (
        <div class="backdrop" style={{ backgroundImage: `url("${artwork}")` }} aria-hidden="true" />
      )}

      <header class="header">
        {artwork ? (
          <img
            class="art"
            src={artwork}
            alt=""
            onError={() => setArtFailed(true)}
            referrerpolicy="no-referrer"
          />
        ) : (
          <div class="art placeholder" aria-hidden="true">
            ♪
          </div>
        )}
        <div class="meta">
          <h2 class="title" title={heading}>
            {heading}
          </h2>
          {subheading && <p class="artist">{subheading}</p>}
        </div>
      </header>

      <div class="body">
        {state.phase === 'loading' && (
          <div class="status">
            <Dots />
            <p>Searching for lyrics…</p>
          </div>
        )}
        {state.phase === 'skipped' && (
          <div class="status">
            <p class="big-text">This doesn't look like a music video</p>
            <button type="button" class="action" onClick={onSearchAnyway}>
              Search lyrics anyway
            </button>
          </div>
        )}
        {state.phase === 'done' && state.result.status === 'found' && (
          <LyricsView
            lyrics={state.result.lyrics}
            playback={playback}
            unsyncedNotice={
              isShorts && state.result.lyrics.sync !== 'none'
                ? "Shorts play a clip of the song, so lyrics aren't synced"
                : undefined
            }
          />
        )}
        {state.phase === 'done' && state.result.status === 'instrumental' && (
          <div class="status">
            <p class="big">♪</p>
            <p>Instrumental</p>
          </div>
        )}
        {state.phase === 'done' && state.result.status === 'not-found' && (
          <div class="status">
            <p class="big-text">No lyrics found</p>
            <p class="hint">
              Searched LRCLIB, NetEase, YouTube captions and the web for “{state.result.query.title}
              ”{state.result.query.artist && ` by ${state.result.query.artist}`}
            </p>
            <button type="button" class="action" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}
        {state.phase === 'done' && state.result.status === 'error' && (
          <div class="status">
            <p class="big-text">Couldn't load lyrics</p>
            <p class="hint">{state.result.message}</p>
            <button type="button" class="action" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}
      </div>

      {found && (
        <footer class="footer">
          <span class="source">
            {SOURCE_LABELS[found.lyrics.source]} · {timing}
          </span>
          {synced && (
            <span class="nudge" title="Adjust timing if lyrics run early or late">
              <button type="button" onClick={() => onNudge(-250)} aria-label="Lyrics earlier">
                −
              </button>
              <span class="nudge-value">
                {userOffset === 0
                  ? '0.00s'
                  : `${userOffset > 0 ? '+' : ''}${(userOffset / 1000).toFixed(2)}s`}
              </span>
              <button type="button" onClick={() => onNudge(250)} aria-label="Lyrics later">
                +
              </button>
            </span>
          )}
        </footer>
      )}
    </section>
  );
}
