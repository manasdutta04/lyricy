import { storage } from '#imports';

/**
 * How to show lyrics written in non-Latin scripts (Hindi, Punjabi, Korean, Japanese…):
 * - 'romanized': English letters only, e.g. Hinglish "Tum hi ho" (default)
 * - 'both': English letters, with the original script underneath
 * - 'original': the original script only
 */
export type ScriptMode = 'romanized' | 'both' | 'original';

export const scriptModeSetting = storage.defineItem<ScriptMode>('local:scriptMode', {
  fallback: 'romanized',
});
