import { describe, expect, it } from 'vitest';
import { newUuid } from './uuid';

describe('newUuid', () => {
  it('returns a unique RFC-like id', () => {
    const a = newUuid();
    const b = newUuid();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(16);
  });

  it('matches uuid v4 shape when crypto is present', () => {
    const id = newUuid();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
