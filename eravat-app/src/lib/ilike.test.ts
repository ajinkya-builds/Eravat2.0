import { describe, expect, it } from 'vitest';
import { sanitiseIlikeTerm, tokenOrFilters } from './ilike';

describe('sanitiseIlikeTerm', () => {
  it('keeps a normal name search', () => {
    expect(sanitiseIlikeTerm('  Sita Devi  ')).toBe('Sita Devi');
  });

  it('strips PostgREST .or() and LIKE metacharacters', () => {
    expect(sanitiseIlikeTerm('foo,bar%_.(x)')).toBe('foo bar x');
  });
});

describe('tokenOrFilters', () => {
  it('ANDs words so a full name can match split first and last columns', () => {
    expect(tokenOrFilters(['first_name', 'last_name', 'phone'], 'Rahul Kumar')).toEqual([
      'first_name.ilike.%Rahul%,last_name.ilike.%Rahul%,phone.ilike.%Rahul%',
      'first_name.ilike.%Kumar%,last_name.ilike.%Kumar%,phone.ilike.%Kumar%',
    ]);
  });

  it('returns nothing for a blank search', () => {
    expect(tokenOrFilters(['first_name'], '  ,.%  ')).toEqual([]);
  });
});
