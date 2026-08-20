import { describe, expect, it } from 'vitest';
import { sanitiseIlikeTerm } from './ilike';

describe('sanitiseIlikeTerm', () => {
  it('keeps a normal name search', () => {
    expect(sanitiseIlikeTerm('  Sita Devi  ')).toBe('Sita Devi');
  });

  it('strips PostgREST .or() and LIKE metacharacters', () => {
    expect(sanitiseIlikeTerm('foo,bar%_.(x)')).toBe('foo bar x');
  });
});
