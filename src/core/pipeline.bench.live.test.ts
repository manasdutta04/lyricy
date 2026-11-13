/**
 * Hit-rate benchmark over real YouTube uploads: Hindi/Punjabi label uploads
 * (T-Series, Sony, Zee, Saregama, YRF, Speed Records…) and Bengali ones (SVF,
 * Zee Music Bangla, Amara Muzik…). Hits the real lyric services one song at a
 * time. Skipped by default.
 *
 *   LIVE=1 npx vitest run src/core/pipeline.bench.live.test.ts --reporter=verbose --silent=false
 *   LIVE=1 BENCH=bengali npx vitest run src/core/pipeline.bench.live.test.ts …
 */
import { expect, it } from 'vitest';
import bengali from './__fixtures__/bengali-uploads.json';
import hindi from './__fixtures__/real-uploads.json';
import type { VideoDetails } from './lyrics/types';
import { findLyrics } from './pipeline';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

/** iTunes allows ~20 requests/minute; stay under it. */
const PAUSE_MS = 9000;

const SETS: Record<string, { uploads: VideoDetails[]; minRate: number }> = {
  hindi: { uploads: hindi as VideoDetails[], minRate: 0.85 },
  bengali: { uploads: bengali as VideoDetails[], minRate: 0.5 },
};

const selected = (env?.BENCH ?? 'hindi,bengali').split(',');

for (const [name, { uploads, minRate }] of Object.entries(SETS)) {
  it.skipIf(!env?.LIVE || !selected.includes(name))(
    `finds lyrics for ${name} uploads`,
    { timeout: 20 * 60_000 },
    async () => {
      let found = 0;
      let synced = 0;
      const misses: string[] = [];
      for (const [i, upload] of uploads.entries()) {
        const result = await findLyrics({ ...upload, site: 'youtube' }, { fetch });
        let line = JSON.stringify(result);
        if (result.status === 'found') {
          const l = result.lyrics;
          const timing = l.sync === 'none' ? 'plain' : l.videoMismatch ? 'follow' : 'synced';
          if (timing === 'synced') synced++;
          const first = l.lines[0];
          line = `${result.track.artist} — ${result.track.title} [${l.source}/${timing}, ${result.confidence.toFixed(2)}] «${(first?.romanized ?? first?.text ?? '').slice(0, 40)}»`;
        }
        console.log(
          `BENCH ${result.status.padEnd(10)} ${upload.title.slice(0, 55).padEnd(55)} → ${line}`,
        );
        if (result.status === 'found' || result.status === 'instrumental') found++;
        else misses.push(upload.title);
        if (i < uploads.length - 1) await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
      const pct = (n: number) => `${((n / uploads.length) * 100).toFixed(0)}%`;
      console.log(
        `BENCH ${name}: found ${found}/${uploads.length} (${pct(found)}), synced line-by-line ${synced} (${pct(synced)})`,
      );
      console.log(`BENCH ${name} misses:\n${misses.join('\n')}`);
      expect(found / uploads.length).toBeGreaterThanOrEqual(minRate);
    },
  );
}
