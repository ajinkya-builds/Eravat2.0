import { describe, it, expect } from 'vitest';
import { cn } from '../utils';

describe('utils/cn', () => {
  it('merges tailwind classes correctly', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('handles conditional classes', () => {
    expect(cn('px-2', true && 'py-2', false && 'm-1')).toBe('px-2 py-2');
  });

  it('handles arrays of classes', () => {
    expect(cn(['px-2', 'py-1'], 'text-red-500')).toBe('px-2 py-1 text-red-500');
  });
});
