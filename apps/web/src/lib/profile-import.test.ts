/**
 * `importLinkedProfiles` fills the attendee's card from the public profiles it
 * links to (#96, #173). What matters is how it behaves when one source is
 * missing, refuses, or disagrees with the other — the attendee sees the
 * outcome as a status line and must never lose what they typed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttendeeProfile } from '@indiafoss/model';
import { importLinkedProfiles } from './profile-import';
import * as fossunited from './fossunited';
import * as github from './github';

const FOSSU_URL = 'https://fossunited.org/u/asha';
const GITHUB_URL = 'https://github.com/asha';

function card(overrides: Partial<AttendeeProfile> = {}): AttendeeProfile {
  return { fullName: '', socials: {}, ...overrides };
}

const linked = (overrides: Partial<AttendeeProfile> = {}) =>
  card({ fossUnitedProfileUrl: FOSSU_URL, socials: { github: GITHUB_URL }, ...overrides });

function fossuAnswers(result: fossunited.ImportResult) {
  return vi.spyOn(fossunited, 'importFossUnitedProfile').mockResolvedValueOnce(result);
}

function githubAnswers(result: github.GithubImportResult) {
  return vi.spyOn(github, 'importGithubProfile').mockResolvedValueOnce(result);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('importLinkedProfiles', () => {
  it('asks for a link first when the card has neither, without calling any source', async () => {
    const fossu = vi.spyOn(fossunited, 'importFossUnitedProfile');
    const gh = vi.spyOn(github, 'importGithubProfile');
    // Whitespace counts as unset: a stray space must not trigger a fetch.
    const outcome = await importLinkedProfiles(
      card({ fossUnitedProfileUrl: '  ', socials: { github: ' ' } }),
    );
    expect(outcome).toEqual({
      changes: [],
      problems: ['Add your FOSS United username or GitHub link first.'],
      sources: [],
    });
    expect(fossu).not.toHaveBeenCalled();
    expect(gh).not.toHaveBeenCalled();
  });

  it('fills the card from FOSS United and reports what changed', async () => {
    fossuAnswers({
      ok: true,
      profile: { fullName: 'Asha Menon', website: 'https://asha.example', socials: {} },
    });
    const profile = card({ fossUnitedProfileUrl: FOSSU_URL });
    const outcome = await importLinkedProfiles(profile);
    expect(outcome.sources).toEqual(['FOSS United']);
    expect(outcome.problems).toEqual([]);
    expect(outcome.changes).toEqual([
      { field: 'Name', value: 'Asha Menon' },
      { field: 'Website', value: 'https://asha.example' },
    ]);
    expect(profile.fullName).toBe('Asha Menon');
    expect(profile.website).toBe('https://asha.example');
  });

  it('fills the card from GitHub alone when that is the only link', async () => {
    githubAnswers({
      ok: true,
      profile: { fullName: 'Asha Menon', email: 'asha@example.org', socials: {} },
    });
    const profile = card({ socials: { github: GITHUB_URL } });
    const outcome = await importLinkedProfiles(profile);
    expect(outcome.sources).toEqual(['GitHub']);
    expect(outcome.problems).toEqual([]);
    // GitHub's public email is imported when present (#173).
    expect(profile).toMatchObject({ fullName: 'Asha Menon', email: 'asha@example.org' });
  });

  it('reads both sources together, so one failing does not lose the other', async () => {
    // On the web fossunited.org is CORS-blocked; GitHub still answers.
    const fossu = fossuAnswers({ ok: false, failure: 'blocked' });
    const gh = githubAnswers({
      ok: true,
      profile: { fullName: 'Asha Menon', avatarUrl: 'https://avatars.example/asha', socials: {} },
    });
    const profile = linked();
    const outcome = await importLinkedProfiles(profile);
    expect(fossu).toHaveBeenCalledWith(FOSSU_URL);
    expect(gh).toHaveBeenCalledWith(GITHUB_URL);
    expect(outcome.sources).toEqual(['GitHub']);
    expect(outcome.problems).toEqual([`FOSS United: ${fossunited.IMPORT_MESSAGES.blocked}`]);
    expect(outcome.changes).toEqual([
      { field: 'Name', value: 'Asha Menon' },
      { field: 'Photo', value: 'https://avatars.example/asha' },
    ]);
    expect(profile.fullName).toBe('Asha Menon');
  });

  it('leaves the card untouched and names both problems when both sources fail', async () => {
    fossuAnswers({ ok: false, failure: 'not-found' });
    githubAnswers({ ok: false, failure: 'not-found' });
    const profile = linked();
    const before = structuredClone(profile);
    const outcome = await importLinkedProfiles(profile);
    expect(outcome.sources).toEqual([]);
    expect(outcome.changes).toEqual([]);
    expect(outcome.problems).toEqual([
      `FOSS United: ${fossunited.IMPORT_MESSAGES['not-found']}`,
      'GitHub: no such user.',
    ]);
    expect(profile).toEqual(before);
  });

  it('lets FOSS United win a field both know, and GitHub fill what it lacks', async () => {
    fossuAnswers({
      ok: true,
      profile: { fullName: 'Asha Menon', website: 'https://asha.example', socials: {} },
    });
    githubAnswers({
      ok: true,
      profile: {
        fullName: 'asha-gh',
        website: 'https://gh.example',
        email: 'asha@example.org',
        socials: { mastodon: 'https://fosstodon.org/@asha' },
      },
    });
    const profile = linked();
    const outcome = await importLinkedProfiles(profile);
    expect(outcome.sources).toEqual(['FOSS United', 'GitHub']);
    expect(profile).toMatchObject({
      fullName: 'Asha Menon',
      website: 'https://asha.example',
      email: 'asha@example.org',
    });
    expect(profile.socials.mastodon).toBe('https://fosstodon.org/@asha');
    // Changes are listed in the order they were applied: FOSS United first.
    expect(outcome.changes.map((c) => c.field)).toEqual(['Name', 'Website', 'Email', 'mastodon']);
  });

  it('never overwrites what the attendee typed, and does not report it as a change', async () => {
    fossuAnswers({
      ok: true,
      profile: { fullName: 'Asha Menon', website: 'https://asha.example', socials: {} },
    });
    githubAnswers({
      ok: true,
      profile: { fullName: 'asha-gh', email: 'asha@example.org', socials: { github: GITHUB_URL } },
    });
    const profile = linked({ fullName: 'A. Menon', website: 'https://typed.example' });
    const outcome = await importLinkedProfiles(profile);
    expect(profile.fullName).toBe('A. Menon');
    expect(profile.website).toBe('https://typed.example');
    expect(profile.socials.github).toBe(GITHUB_URL);
    expect(outcome.changes).toEqual([{ field: 'Email', value: 'asha@example.org' }]);
    expect(outcome.problems).toEqual([]);
  });

  it('explains each FOSS United refusal in the words the import dialog uses', async () => {
    for (const failure of ['invalid-url', 'not-found', 'blocked', 'network'] as const) {
      fossuAnswers({ ok: false, failure });
      const outcome = await importLinkedProfiles(card({ fossUnitedProfileUrl: FOSSU_URL }));
      expect(outcome.problems).toEqual([`FOSS United: ${fossunited.IMPORT_MESSAGES[failure]}`]);
    }
  });

  it('explains each GitHub refusal, including the unauthenticated rate limit', async () => {
    const expected = {
      'rate-limited':
        'GitHub: too many requests from this network right now; try again in a while.',
      'not-found': 'GitHub: no such user.',
      'invalid-url': 'GitHub: that is not a GitHub profile link.',
      network: 'GitHub: could not reach api.github.com. Check your connection and try again.',
    } as const;
    for (const [failure, message] of Object.entries(expected)) {
      githubAnswers({ ok: false, failure: failure as keyof typeof expected });
      const outcome = await importLinkedProfiles(card({ socials: { github: GITHUB_URL } }));
      expect(outcome.problems).toEqual([message]);
    }
  });

  it('treats an ok answer with no profile as a network failure', async () => {
    // `ok: true` without a profile is how a source signals it read nothing
    // usable; it must not be counted as a source that answered.
    fossuAnswers({ ok: true });
    const outcome = await importLinkedProfiles(card({ fossUnitedProfileUrl: FOSSU_URL }));
    expect(outcome.sources).toEqual([]);
    expect(outcome.problems).toEqual([`FOSS United: ${fossunited.IMPORT_MESSAGES.network}`]);
  });
});
