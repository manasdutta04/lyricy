import { describe, expect, it } from 'vitest';
import { isWatchPage, pageKind, parseVideoId } from './video-id';

const ID = 'dQw4w9WgXcQ';

describe('parseVideoId', () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?list=PL123&v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
  ])('parses %s', (href) => {
    expect(parseVideoId(href)).toBe(ID);
  });

  it.each([
    'https://www.youtube.com/',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/@channel',
    `https://notyoutube.com/watch?v=${ID}`,
    `https://evil-youtube.com/watch?v=${ID}`,
    'not a url',
  ])('rejects %s', (href) => {
    expect(parseVideoId(href)).toBeNull();
  });
});

describe('pageKind', () => {
  it('classifies pages', () => {
    expect(pageKind(`https://www.youtube.com/watch?v=${ID}`)).toBe('watch');
    expect(pageKind(`https://music.youtube.com/watch?v=${ID}&list=RD`)).toBe('watch');
    expect(pageKind(`https://www.youtube.com/shorts/${ID}`)).toBe('shorts');
    expect(pageKind('https://www.youtube.com/shorts')).toBe('other');
    expect(pageKind('https://www.youtube.com/')).toBe('other');
  });
});

describe('isWatchPage', () => {
  it('is true only for /watch with a valid id', () => {
    expect(isWatchPage(`https://www.youtube.com/watch?v=${ID}`)).toBe(true);
    expect(isWatchPage(`https://www.youtube.com/shorts/${ID}`)).toBe(false);
    expect(isWatchPage('https://www.youtube.com/feed/subscriptions')).toBe(false);
  });
});
