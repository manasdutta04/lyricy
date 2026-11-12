import { describe, expect, it } from 'vitest';
import { cleanDocumentTitle } from './title';

describe('cleanDocumentTitle', () => {
  it('strips notification count and YouTube suffix', () => {
    expect(cleanDocumentTitle('(3) Artist - Song (Official Video) - YouTube')).toBe(
      'Artist - Song (Official Video)',
    );
  });
  it('leaves plain titles alone', () => {
    expect(cleanDocumentTitle('YouTube')).toBe('YouTube');
    expect(cleanDocumentTitle('Song')).toBe('Song');
  });
});
