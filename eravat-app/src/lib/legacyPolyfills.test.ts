import { describe, expect, it } from 'vitest';
import './legacyPolyfills';

describe('legacyPolyfills', () => {
  it('replaceAll substitutes all occurrences', () => {
    expect('a {n} and {n}'.replaceAll('{n}', '1')).toBe('a 1 and 1');
  });

  it('Object.fromEntries builds an object', () => {
    expect(Object.fromEntries([['a', 1], ['b', 2]])).toEqual({ a: 1, b: 2 });
  });

  it('Array.flat flattens one level', () => {
    expect([1, [2, 3]].flat()).toEqual([1, 2, 3]);
  });
});
