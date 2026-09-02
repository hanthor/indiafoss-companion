import { describe, expect, it } from 'vitest';
import type { AttendeeProfile } from '@indiafoss/model';
import { applyImportedProfile } from './fossunited';

const imported = {
  fullName: 'James Reilly',
  website: 'https://reilly.asia',
  socials: { github: 'https://github.com/hanthor', linkedin: 'https://linkedin.com/in/jreilly112' },
};

describe('applyImportedProfile', () => {
  it('fills empty fields and reports them', () => {
    const target: AttendeeProfile = { fullName: '', socials: {} };
    const changes = applyImportedProfile(target, imported);
    expect(target.fullName).toBe('James Reilly');
    expect(target.website).toBe('https://reilly.asia');
    expect(target.socials.github).toBe('https://github.com/hanthor');
    expect(changes.map((c) => c.field)).toEqual(['Name', 'Website', 'github', 'linkedin']);
  });

  it('never overwrites what the attendee typed', () => {
    const target: AttendeeProfile = {
      fullName: 'Jim',
      website: 'https://example.org',
      socials: { github: 'https://github.com/someone-else' },
    };
    const changes = applyImportedProfile(target, imported);
    expect(target.fullName).toBe('Jim');
    expect(target.website).toBe('https://example.org');
    expect(target.socials.github).toBe('https://github.com/someone-else');
    expect(changes.map((c) => c.field)).toEqual(['linkedin']);
  });

  it('reports no changes when there is nothing to add', () => {
    const target: AttendeeProfile = { fullName: 'Jim', socials: {} };
    expect(applyImportedProfile(target, { socials: {} })).toEqual([]);
  });
});
