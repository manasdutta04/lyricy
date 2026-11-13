/**
 * Hit-rate benchmark over real YouTube uploads (T-Series, Sony, Zee, Saregama, YRF,
 * Speed Records…). Hits the real lyric services, one song at a time. Skipped by default.
 *
 *   LIVE=1 npx vitest run src/core/pipeline.bench.live.test.ts --reporter=verbose --silent=false
 */
import { expect, it } from 'vitest';
import uploads from './__fixtures__/real-uploads.json';
import type { VideoDetails } from './lyrics/types';
import { findLyrics } from './pipeline';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

/** iTunes allows ~20 requests/minute; stay under it. */
const PAUSE_MS = 9000;

it.skipIf(!env?.LIVE)('finds lyrics for most real uploads', { timeout: 15 * 60_000 }, async () => {
  let found = 0;
  const misses: string[] = [];
  for (const [i, upload] of (uploads as VideoDetails[]).entries()) {
    const result = await findLyrics({ ...upload, site: 'youtube' }, { fetch });
    const line =
      result.status === 'found'
        ? `${result.track.artist} — ${result.track.title} [${result.lyrics.source}/${result.lyrics.sync}, ${result.confidence.toFixed(2)}] «${(result.lyrics.lines[0]?.romanized ?? result.lyrics.lines[0]?.text ?? '').slice(0, 40)}»`
        : JSON.stringify(result);
    console.log(
      `BENCH ${result.status.padEnd(12)} ${upload.title.slice(0, 60).padEnd(60)} → ${line}`,
    );
    if (result.status === 'found' || result.status === 'instrumental') found++;
    else misses.push(upload.title);
    if (i < uploads.length - 1) await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  const rate = found / uploads.length;
  console.log(`BENCH hit rate: ${found}/${uploads.length} = ${(rate * 100).toFixed(0)}%`);
  console.log(`BENCH misses:\n${misses.join('\n')}`);
  expect(rate).toBeGreaterThan(0.8);
});
