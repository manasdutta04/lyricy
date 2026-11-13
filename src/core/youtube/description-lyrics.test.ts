import { describe, expect, it } from 'vitest';
import { parseDescriptionLyrics } from './description-lyrics';

const SVF = `Listen to 'Ami Mantra Tantra Kichhui Janine Ma' from the film 'Sadhak Bamakhyapa'

Credit list:
Song: Ami montro tontro
Singer: Manomay Bhattacharjee
Mix and master: Subhaadeep Pan

Lyrics :

আমি মন্ত্র তন্ত্র কিছুই জানিনে মা
শুধু যা জেনেছি সে'টুক হলো এই
তোরে ডাকার মত ডাকতে যদি পারি
তবে আসবিনে তোর এমন সাধ্য নেই

যদি তোর ও মন্দিরের দ্বারে
তোমার লাগি কাঁদি অঝোর ধারে

------------------------------------------------------------------------------
Enjoy and stay connected with us!!
► Subscribe to SVF YouTube channel : http://bit.ly/SVFsocial
#AmiMantraTantraKichhuiJanineMa #SVF`;

describe('parseDescriptionLyrics', () => {
  it('takes the block under a "Lyrics :" heading, up to the separator', () => {
    const text = parseDescriptionLyrics(SVF);
    expect(text?.split('\n')[0]).toBe('আমি মন্ত্র তন্ত্র কিছুই জানিনে মা');
    expect(text).toContain('তোমার লাগি কাঁদি অঝোর ধারে');
    expect(text).not.toContain('Enjoy');
    expect(text).not.toContain('---');
  });

  it('ignores a lyricist credit', () => {
    expect(parseDescriptionLyrics('Singer: Arijit Singh\nLyrics : Gulzar\nMusic: Pritam')).toBe(
      undefined,
    );
  });

  it('keeps English lyric lines that start with everyday words', () => {
    const desc =
      'Lyrics:\nLike a river flows\nStay with me tonight\nWatch the sky turn gold\nFollow me home\n\nSubscribe for more';
    expect(parseDescriptionLyrics(desc)?.split('\n')).toEqual([
      'Like a river flows',
      'Stay with me tonight',
      'Watch the sky turn gold',
      'Follow me home',
    ]);
  });

  it('reads a Hindi heading', () => {
    const desc = 'गीत के बोल:\nतुम ही हो\nअब तुम ही हो\nज़िन्दगी अब तुम ही हो\nचैन भी मेरा दर्द भी';
    expect(parseDescriptionLyrics(desc)?.split('\n')).toHaveLength(4);
  });

  it('needs a real block of lines', () => {
    expect(parseDescriptionLyrics('Lyrics:\nOne line\n\n#tag')).toBe(undefined);
    expect(parseDescriptionLyrics('Just a description with no lyrics')).toBe(undefined);
  });
});
