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
  onSearch: (title: string, artist: string) => void;
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

/** Compact "song / artist" search used for misses and wrong matches. */
function SearchForm({
  initialTitle,
  initialArtist,
  onSearch,
  onCancel,
}: {
  initialTitle: string;
  initialArtist: string;
  onSearch: (title: string, artist: string) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [artist, setArtist] = useState(initialArtist);
  return (
    <form
      class="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(title, artist);
      }}
    >
      <input
        class="field"
        value={title}
        onInput={(e) => setTitle(e.currentTarget.value)}
        placeholder="Song"
        aria-label="Song"
      />
      <input
        class="field"
        value={artist}
        onInput={(e) => setArtist(e.currentTarget.value)}
        placeholder="Artist (optional)"
        aria-label="Artist"
      />
      <div class="search-actions">
        {onCancel && (
          <button type="button" class="link" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" class="pill" disabled={!title.trim()}>
          Search
        </button>
      </div>
    </form>
  );
}

const formatOffset = (ms: number) =>
  ms === 0 ? '0.0s' : `${ms > 0 ? '+' : ''}${(ms / 1000).toFixed(2)}s`;

/** Minimal lyrics card: small header, lyrics, and a quiet footer. */
export function LyricsSurface({
  state,
  playback,
  isShorts,
  userOffset,
  onNudge,
  onRetry,
  onSearchAnyway,
  onSearch,
}: Props) {
  const [artFailed, setArtFailed] = useState(false);
  const [searching, setSearching] = useState(false);
  const track = trackOf(state);
  const playing = state.phase === 'idle' ? null : state.track;
  const artworkCandidate =
    track?.artworkUrl ??
    playing?.artworkUrl ??
    (playing?.youtube
      ? `https://i.ytimg.com/vi/${playing.youtube.videoId}/mqdefault.jpg`
      : undefined);
  useEffect(() => setArtFailed(false), [artworkCandidate]);
  useEffect(() => setSearching(false), [playing?.key, state.phase]);

  if (state.phase === 'idle' || !playing) return null;

  const artwork = artFailed ? undefined : artworkCandidate;
  const heading = track?.title ?? playing.youtube?.music?.title ?? playing.title;
  const subheading = track?.artist ?? playing.youtube?.music?.artist ?? playing.artist;
  const found = state.phase === 'done' && state.result.status === 'found' ? state.result : null;
  const synced = found && found.lyrics.sync !== 'none' && !isShorts && !found.lyrics.videoMismatch;
  const notFound =
    state.phase === 'done' && state.result.status === 'not-found' ? state.result : null;
  const searchTitle = notFound?.query.title ?? heading;
  const searchArtist = notFound?.query.artist ?? subheading ?? '';

  let timing = '';
  if (found) {
    if (isShorts || found.lyrics.sync === 'none' || found.lyrics.videoMismatch)
      timing = 'not synced';
    else if (found.lyrics.autoCaptions) timing = 'auto-generated, may be inexact';
    else if (found.lyrics.autoSynced) timing = 'synced with YouTube captions';
    else if (found.lyrics.offsetMs) timing = 'matched to video';
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

      {searching && !notFound && (
        <SearchForm
          initialTitle={searchTitle}
          initialArtist={searchArtist}
          onSearch={(t, a) => {
            setSearching(false);
            onSearch(t, a);
          }}
          onCancel={() => setSearching(false)}
        />
      )}

      <div class="body">
        {state.phase === 'loading' && (
          <div class="status">
            <Dots />
          </div>
        )}
        {state.phase === 'skipped' && (
          <div class="status">
            <p>Not a music video?</p>
            <button type="button" class="pill" onClick={onSearchAnyway}>
              Find lyrics anyway
            </button>
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
        {notFound && (
          <div class="status">
            <p>No lyrics found.</p>
            <p>Try a different title:</p>
            <SearchForm
              initialTitle={searchTitle}
              initialArtist={searchArtist}
              onSearch={onSearch}
            />
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
          <span class="source" title={`Lyrics from ${SOURCE_LABELS[found.lyrics.source]}`}>
            {SOURCE_LABELS[found.lyrics.source]}
            {timing && ` · ${timing}`}
          </span>
          <span class="tools">
            {synced && (
              <span class="nudge" title="Shift lyrics if they run early or late">
                <button
                  type="button"
                  onClick={() => onNudge(-250)}
                  aria-label="Show lyrics earlier"
                >
                  −
                </button>
                <span class="nudge-value">{formatOffset(userOffset)}</span>
                <button type="button" onClick={() => onNudge(250)} aria-label="Show lyrics later">
                  +
                </button>
              </span>
            )}
            <button
              type="button"
              class="tool"
              onClick={() => setSearching((s) => !s)}
              title="Wrong lyrics? Search"
              aria-label="Wrong lyrics? Search"
            >
              ⌕
            </button>
          </span>
        </footer>
      )}
    </section>
  );
}
