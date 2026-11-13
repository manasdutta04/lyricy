import { useEffect, useState } from 'preact/hooks';
import { SOURCE_LABELS } from '@/core/lyrics/types';
import { LyricsView, type Playback } from './LyricsView';
import { type LyricsState, trackOf } from './use-lyrics';

interface Props {
  state: LyricsState;
  playback: Playback;
  isShorts?: boolean;
  onRetry: () => void;
  onFindAnyway: () => void;
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

/** Minimal lyrics card: small header, lyrics, and a one-line source footer. */
export function LyricsSurface({ state, playback, isShorts, onRetry, onFindAnyway }: Props) {
  const [artFailed, setArtFailed] = useState(false);
  const track = trackOf(state);
  const playing = state.phase === 'idle' ? null : state.track;
  const artworkCandidate =
    track?.artworkUrl ??
    playing?.artworkUrl ??
    (playing?.youtube
      ? `https://i.ytimg.com/vi/${playing.youtube.videoId}/mqdefault.jpg`
      : undefined);
  useEffect(() => setArtFailed(false), [artworkCandidate]);

  if (state.phase === 'idle' || !playing) return null;

  const artwork = artFailed ? undefined : artworkCandidate;
  const heading = track?.title ?? playing.youtube?.music?.title ?? playing.title;
  const subheading = track?.artist ?? playing.youtube?.music?.artist ?? playing.artist;
  const found = state.phase === 'done' && state.result.status === 'found' ? state.result : null;

  let timing = '';
  if (found) {
    const { lyrics } = found;
    if (isShorts || lyrics.sync === 'none' || lyrics.videoMismatch) timing = 'not synced';
    else if (lyrics.autoCaptions) timing = 'auto-generated';
    else if (lyrics.autoSynced) timing = 'synced to this video';
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
          </div>
        )}
        {found && (
          <LyricsView
            lyrics={found.lyrics}
            playback={playback}
            unsyncedNotice={
              isShorts && found.lyrics.sync !== 'none'
                ? "Shorts play a clip, so lyrics aren't synced"
                : undefined
            }
          />
        )}
        {state.phase === 'done' && state.result.status === 'instrumental' && (
          <div class="status">
            <p>♪ Instrumental</p>
          </div>
        )}
        {state.phase === 'done' && state.result.status === 'not-found' && (
          <div class="status">
            {state.deep ? (
              <p>Still no lyrics for this song anywhere we can look.</p>
            ) : (
              <>
                <p>No lyrics found for this song.</p>
                <button type="button" class="pill" onClick={onFindAnyway}>
                  Find it anyway
                </button>
              </>
            )}
          </div>
        )}
        {state.phase === 'done' && state.result.status === 'error' && (
          <div class="status">
            <p>Couldn't load lyrics</p>
            <button type="button" class="pill" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}
      </div>

      {found && (
        <footer class="footer">
          <span class="source">
            {SOURCE_LABELS[found.lyrics.source]}
            {timing && ` · ${timing}`}
          </span>
        </footer>
      )}
    </section>
  );
}
