import { useCallback, useEffect, useState } from 'preact/hooks';

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

const api = () =>
  (window as Window & { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture;

/** Copy the panel's stylesheets into the floating window (absolute URLs, since it's about:blank). */
function copyStyles(target: Document) {
  for (const node of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
    if (node instanceof HTMLLinkElement) {
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = node.href;
      target.head.appendChild(link);
    } else {
      target.head.appendChild(node.cloneNode(true));
    }
  }
}

/**
 * A small always-on-top lyrics window (Document Picture-in-Picture). Chrome hides
 * the side panel in fullscreen; this window stays visible over fullscreen video
 * and other apps. Opening it needs a click (Chrome requires a user gesture).
 */
export function useFloatingWindow() {
  const [win, setWin] = useState<Window | null>(null);
  const supported = Boolean(api());

  const open = useCallback(async () => {
    const pip = api();
    if (!pip) return;
    try {
      const w = await pip.requestWindow({ width: 380, height: 560 });
      copyStyles(w.document);
      w.document.title = 'Lyricy';
      w.document.body.classList.add('floating');
      w.addEventListener('pagehide', () => setWin(null), { once: true });
      setWin(w);
    } catch {
      // The user dismissed it, or the browser refused.
    }
  }, []);

  const close = useCallback(() => win?.close(), [win]);
  useEffect(() => () => win?.close(), [win]);

  return { supported, win, open, close };
}
