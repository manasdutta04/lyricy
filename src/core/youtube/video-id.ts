const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const ID_PATH_PREFIXES = new Set(['shorts', 'embed', 'live', 'v']);

function isYouTubeHost(hostname: string): boolean {
  return (
    hostname === 'youtube.com' ||
    hostname.endsWith('.youtube.com') ||
    hostname === 'youtube-nocookie.com' ||
    hostname.endsWith('.youtube-nocookie.com')
  );
}

/** Extracts the 11-char video ID from any common YouTube URL shape, or null. */
export function parseVideoId(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  let candidate: string | null | undefined = null;
  const segments = url.pathname.split('/').filter(Boolean);

  if (url.hostname === 'youtu.be') {
    candidate = segments[0];
  } else if (isYouTubeHost(url.hostname)) {
    if (segments[0] === 'watch') candidate = url.searchParams.get('v');
    else if (segments[0] && ID_PATH_PREFIXES.has(segments[0])) candidate = segments[1];
  }

  return candidate && VIDEO_ID.test(candidate) ? candidate : null;
}

export type PageKind = 'watch' | 'shorts' | 'other';

/** Which kind of YouTube page `href` is (YouTube Music watch pages count as 'watch'). */
export function pageKind(href: string): PageKind {
  if (isWatchPage(href)) return 'watch';
  try {
    const url = new URL(href);
    if (isYouTubeHost(url.hostname) && url.pathname.startsWith('/shorts/') && parseVideoId(href)) {
      return 'shorts';
    }
  } catch {
    // not a URL
  }
  return 'other';
}

/** True for the regular watch page (where the sidebar panel lives). */
export function isWatchPage(href: string): boolean {
  try {
    const url = new URL(href);
    return isYouTubeHost(url.hostname) && url.pathname === '/watch' && parseVideoId(href) !== null;
  } catch {
    return false;
  }
}
