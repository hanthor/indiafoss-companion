import { describe, expect, it, vi } from 'vitest';
import type { AttendeeProfile } from '@indiafoss/model';
import { importLinkedProfiles } from './profile-import';
import * as fossunited from './fossunited';
import * as github from './github';

describe('importLinkedProfiles', () => {
  it('returns problem when neither FOSS United nor GitHub link is set', async () => {
    const profile: AttendeeProfile = { fullName: '', socials: {} };
    const outcome = await importLinkedProfiles(profile);
    expect(outcome.problems).toEqual(['Add your FOSS United username or GitHub link first.']);
    expect(outcome.changes).toEqual([]);
    expect(outcome.sources).toEqual([]);
  });

  it('imports FOSS United profile successfully', async () => {
    vi.spyOn(fossunited, 'importFossUnitedProfile').mockResolvedValueOnce({
      ok: true,
      profile: { fullName: 'Foss User', website: 'https://foss.in', socials: {} },
    });

    const profile: AttendeeProfile = {
      fullName: '',
      socials: {},
      fossUnitedProfileUrl: 'https://fossunited.org/u/fossuser',
    };

    const outcome = await importLinkedProfiles(profile);
    expect(outcome.sources).toEqual(['FOSS United']);
    expect(outcome.problems).toEqual([]);
    expect(profile.fullName).toBe('Foss User');
    expect(profile.website).toBe('https://foss.in');
  });

  it('handles FOSS United import failure', async () => {
    vi.spyOn(fossunited, 'importFossUnitedProfile').mockResolvedValueOnce({
      ok: false,
      failure: 'not-found',
    });

    const profile: AttendeeProfile = {
      fullName: '',
      socials: {},
      fossUnitedProfileUrl: 'https://fossunited.org/u/nonexistent',
    };

    const outcome = await importLinkedProfiles(profile);
    expect(outcome.sources).toEqual([]);
    expect(outcome.problems).toEqual([
      'FOSS United: No public profile at that URL. Check the username on fossunited.org.',
    ]);
  });

  it('imports GitHub profile successfully', async () => {
    vi.spyOn(github, 'importGithubProfile').mockResolvedValueOnce({
      ok: true,
      profile: { fullName: 'GitHub Dev', socials: { github: 'https://github.com/ghuser' } },
    });

    const profile: AttendeeProfile = {
      fullName: '',
      socials: { github: 'https://github.com/ghuser' },
    };

    const outcome = await importLinkedProfiles(profile);
    expect(outcome.sources).toEqual(['GitHub']);
    expect(outcome.problems).toEqual([]);
    expect(profile.fullName).toBe('GitHub Dev');
  });

  it('handles GitHub import failures with custom reason messages', async () => {
    vi.spyOn(github, 'importGithubProfile').mockResolvedValueOnce({
      ok: false,
      failure: 'rate-limited',
    });

    const profile: AttendeeProfile = {
      fullName: '',
      socials: { github: 'https://github.com/ghuser' },
    };

    const outcome = await importLinkedProfiles(profile);
    expect(outcome.sources).toEqual([]);
    expect(outcome.problems).toEqual([
      'GitHub: too many requests from this network right now; try again in a while.',
    ]);
  });
});
