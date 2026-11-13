import { storage } from '#imports';

/**
 * How to show lyrics written in non-Latin scripts (Hindi, Punjabi, Korean, Japanese…):
 * - 'romanized': English letters only, e.g. Hinglish "Tum hi ho"
 * - 'both': English letters, with the original script underneath (default)
 * - 'original': the original script only
 */
export type ScriptMode = 'romanized' | 'both' | 'original';

export const scriptModeSetting = storage.defineItem<ScriptMode>('local:lyricsScript', {
  fallback: 'both',
});
