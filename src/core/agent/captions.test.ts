import { describe, expect, it } from 'vitest';
import { parseAsrTrack, parseCueTrack } from './captions';

describe('caption parsing', () => {
  it('turns uploader captions into lines and drops [Music] markers', () => {
    const cues = parseCueTrack({
      events: [
        { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: '[Music]' }] },
        {
          tStartMs: 2000,
          dDurationMs: 3000,
          segs: [{ utf8: '♪ Hum tere bin ' }, { utf8: 'ab reh nahi sakte ♪' }],
        },
        { tStartMs: 5000, segs: [{ utf8: '\n' }] },
      ],
    });
    expect(cues).toEqual([{ start: 2000, end: 5000, text: 'Hum tere bin ab reh nahi sakte' }]);
  });

  it('turns auto-captions into word timings', () => {
    const words = parseAsrTrack({
      events: [
        {
          tStartMs: 1000,
          segs: [{ utf8: 'hum' }, { utf8: ' tere', tOffsetMs: 400 }, { utf8: '\n' }],
        },
      ],
    });
    expect(words).toEqual([
      { start: 1000, text: 'hum' },
      { start: 1400, text: 'tere' },
    ]);
  });
});
