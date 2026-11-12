/** Turns a raw document.title like "(3) Song - Artist - YouTube" into "Song - Artist". */
export function cleanDocumentTitle(raw: string): string {
  return raw
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s*-\s*YouTube( Music)?$/, '')
    .trim();
}
