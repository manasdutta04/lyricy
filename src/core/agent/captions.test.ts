import { describe, expect, it } from 'vitest';
import { parseAsrLines, parseAsrTrack, parseCueTrack, toCaptionData } from './captions';

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

describe('toCaptionData', () => {
  it('turns captured player captions into cues and words', () => {
    const manual = {
      events: ['Hum tere bin', 'Ab reh nahi sakte', 'Tere bina', 'Kya wajood mera'].map((t, i) => ({
        tStartMs: i * 3000,
        dDurationMs: 2500,
        segs: [{ utf8: t }],
      })),
    };
    const data = toCaptionData({ manual: { language: 'hi', json: manual } });
    expect(data?.manual?.cues).toHaveLength(4);
    expect(data?.manual?.cues[1]).toEqual({ start: 3000, end: 5500, text: 'Ab reh nahi sakte' });
    expect(toCaptionData({})).toBeNull();
  });
});

describe('auto-generated captions', () => {
  const asr = {
    events: [
      { tStartMs: 0, dDurationMs: 3000, segs: [{ utf8: '[संगीत]' }] },
      {
        tStartMs: 3000,
        dDurationMs: 3000,
        segs: [{ utf8: '[गाना गाने की आवाज़]' }, { utf8: ' उमरिया', tOffsetMs: 900 }],
      },
      ...['राम राम जय', 'सीता राम', 'मंगल भवन', 'अमंगल हारी', 'जय जय राम'].map((t, i) => ({
        tStartMs: 6000 + i * 3000,
        dDurationMs: 3000,
        segs: t.split(' ').map((w, j) => ({ utf8: j ? ` ${w}` : w, tOffsetMs: j * 400 })),
      })),
    ],
  };

  it('drops [sound] markers in any language and keeps lines for lyrics', () => {
    const data = toCaptionData({ asr: { language: 'hi', json: asr } });
    expect(data?.asr?.cues?.map((c) => c.text)).toEqual([
      'उमरिया',
      'राम राम जय',
      'सीता राम',
      'मंगल भवन',
      'अमंगल हारी',
      'जय जय राम',
    ]);
    expect(data?.asr?.words.some((w) => w.text.includes('संगीत'))).toBe(false);
  });
});

describe('word-timed caption lines', () => {
  const json = {
    events: [
      {
        tStartMs: 1000,
        dDurationMs: 6000,
        segs: [
          { utf8: '>> মন' },
          { utf8: ' তোর', tOffsetMs: 400 },
          { utf8: ' এত', tOffsetMs: 800 },
        ],
      },
      // Two-word fragment right after: joins the line above.
      {
        tStartMs: 2200,
        dDurationMs: 5000,
        segs: [{ utf8: 'ভাবনা' }, { utf8: ' কেনে', tOffsetMs: 300 }],
      },
      {
        tStartMs: 6000,
        dDurationMs: 4000,
        segs: [
          { utf8: '&gt;&gt; একবার' },
          { utf8: ' কালি', tOffsetMs: 500 },
          { utf8: ' বলে', tOffsetMs: 900 },
        ],
      },
    ],
  };

  it('starts each line at its first spoken word, merges fragments and drops >>', () => {
    const lines = parseAsrLines(json);
    expect(lines.map((l) => l.text)).toEqual(['মন তোর এত ভাবনা কেনে', 'একবার কালি বলে']);
    expect(lines[0]?.start).toBe(1000);
    expect(lines[0]?.words?.map((w) => w.start)).toEqual([1000, 1400, 1800, 2200, 2500]);
    // Ends ~2 s after its last word, so a long pause can show the interlude dots.
    expect(lines[0]?.end).toBe(4600);
    expect(lines[1]?.words?.[2]).toMatchObject({ text: 'বলে', start: 6900 });
  });
});
