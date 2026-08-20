import { describe, expect, it } from 'vitest';
import { buildSupportIssueDraft, sanitiseSupportNotes } from './supportIssues';

describe('supportIssues', () => {
  it('requires at least 3 characters of notes', () => {
    expect(buildSupportIssueDraft('  hi  ')).toEqual({ error: 'notes_required' });
    const ok = buildSupportIssueDraft('Login OTP did not arrive', { pagePath: '/login' });
    expect(ok).toMatchObject({ notes: 'Login OTP did not arrive', page_path: '/login' });
  });

  it('trims and caps notes', () => {
    expect(sanitiseSupportNotes('  hello   world  ')).toBe('hello world');
    expect(sanitiseSupportNotes('x'.repeat(2500)).length).toBe(2000);
  });
});
