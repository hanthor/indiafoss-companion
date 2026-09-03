import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATTENDEE_SHARE_SELECTION,
  attendeeProfileToVCard,
  avatarUrlFor,
  classifyLink,
  contactDeepLinks,
  githubAvatarUrl,
  githubUsername,
  gravatarUrl,
  type AttendeeProfile,
  type AttendeeShareSelection,
} from './contact.js';

const profile: AttendeeProfile = {
  fullName: 'Aarav Sharma',
  organization: 'FOSS United',
  email: 'aarav@example.org',
  phone: '+91 90000 00000',
  website: 'https://aarav.example',
  matrixId: '@aarav:matrix.org',
  fossUnitedProfileUrl: 'https://fossunited.org/u/aarav',
  socials: {
    github: 'https://github.com/aarav',
    mastodon: 'https://fosstodon.org/@aarav',
  },
};

describe('attendeeProfileToVCard', () => {
  it('emits a valid vCard with defaults and omits opt-in-only fields', () => {
    const vcard = attendeeProfileToVCard(profile);
    expect(vcard.startsWith('BEGIN:VCARD\r\nVERSION:3.0')).toBe(true);
    expect(vcard).toContain('FN:Aarav Sharma');
    expect(vcard).toContain('N:Sharma;Aarav;;;');
    expect(vcard).toContain('ORG:FOSS United');
    expect(vcard).toContain('URL;TYPE=website:https://aarav.example');
    expect(vcard).toContain('X-FOSSUNITED-PROFILE:https://fossunited.org/u/aarav');
    // opt-in only fields off by default
    expect(vcard).not.toContain('EMAIL');
    expect(vcard).not.toContain('TEL');
    // A Matrix id is only ever entered in order to be reached on it: on by default.
    expect(vcard).toContain('X-INDIAFOSS-MATRIX:@aarav:matrix.org');
    // only public developer profiles (GitHub, LinkedIn) are shared by default
    expect(vcard).not.toContain('TYPE=x:');
    expect(vcard).not.toContain('TYPE=instagram');
    expect(vcard.trimEnd().endsWith('END:VCARD')).toBe(true);
  });

  it('includes explicitly selected email, phone, matrix, and socials', () => {
    const selection: AttendeeShareSelection = {
      ...DEFAULT_ATTENDEE_SHARE_SELECTION,
      email: true,
      phone: true,
      matrixId: true,
      socials: { github: true, mastodon: false },
    };
    const vcard = attendeeProfileToVCard(profile, selection);
    expect(vcard).toContain('EMAIL;TYPE=INTERNET:aarav@example.org');
    expect(vcard).toContain('TEL;TYPE=CELL:+91 90000 00000');
    expect(vcard).toContain('X-INDIAFOSS-MATRIX:@aarav:matrix.org');
    expect(vcard).toContain('IMPP:matrix:@aarav:matrix.org');
    expect(vcard).toContain('X-SOCIALPROFILE;TYPE=github:https://github.com/aarav');
    expect(vcard).not.toContain('TYPE=mastodon');
  });

  it('escapes special characters and honours a minimal selection', () => {
    const vcard = attendeeProfileToVCard(
      { fullName: 'Comma, Person; Name', socials: {} },
      { ...DEFAULT_ATTENDEE_SHARE_SELECTION, website: false, fossUnitedProfileUrl: false },
    );
    expect(vcard).toContain('FN:Comma\\, Person\\; Name');
    expect(vcard).not.toContain('URL');
    expect(vcard).not.toContain('X-FOSSUNITED-PROFILE');
  });

  it('preserves Unicode names and social values', () => {
    const vcard = attendeeProfileToVCard(
      {
        fullName: 'आरव शर्मा 🚀',
        organization: 'Føss Unión',
        socials: { mastodon: 'https://ümlaut.social/@आरव' },
      },
      {
        ...DEFAULT_ATTENDEE_SHARE_SELECTION,
        organization: true,
        website: false,
        fossUnitedProfileUrl: false,
        socials: { mastodon: true },
      },
    );
    expect(vcard).toContain('FN:आरव शर्मा 🚀');
    expect(vcard).toContain('N:🚀;आरव शर्मा;;;');
    expect(vcard).toContain('ORG:Føss Unión');
    expect(vcard).toContain('X-SOCIALPROFILE;TYPE=mastodon:https://ümlaut.social/@आरव');
  });

  it('produces an empty-but-valid card when nothing is selected', () => {
    const empty: AttendeeShareSelection = {
      name: false,
      organization: false,
      email: false,
      phone: false,
      website: false,
      matrixId: false,
      fossUnitedProfileUrl: false,
      socials: {},
    };
    const vcard = attendeeProfileToVCard(profile, empty);
    expect(vcard).toBe('BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\n');
  });

  it('omits fields with empty or whitespace-only values even when selected', () => {
    const vcard = attendeeProfileToVCard(
      { fullName: 'Solo Attendee', organization: '   ', socials: {} },
      { ...DEFAULT_ATTENDEE_SHARE_SELECTION, organization: true },
    );
    expect(vcard).toContain('FN:Solo Attendee');
    expect(vcard).not.toContain('ORG');
  });

  it('links XMPP (Prav) and Delta Chat contacts', () => {
    const links = contactDeepLinks({
      socials: {
        xmpp: 'xmpp:alice@prav.app',
        deltachat: 'https://i.delta.chat/#ABC&a=alice%40example.org',
      },
    });
    expect(links.map((l) => [l.kind, l.href])).toEqual([
      ['xmpp', 'xmpp:alice@prav.app'],
      ['deltachat', 'https://i.delta.chat/#ABC&a=alice%40example.org'],
    ]);
    expect(contactDeepLinks({ socials: { deltachat: 'alice@example.org' } })).toEqual([
      { kind: 'deltachat', label: 'Delta Chat', href: 'mailto:alice@example.org' },
    ]);
    expect(classifyLink('xmpp:alice@prav.app')).toBe('xmpp');
    expect(classifyLink('https://i.delta.chat/#X')).toBe('deltachat');
  });

  it('turns a fediverse handle into a profile link', () => {
    expect(contactDeepLinks({ socials: { mastodon: '@alice@fosstodon.org' } })).toEqual([
      { kind: 'mastodon', label: 'Mastodon', href: 'https://fosstodon.org/@alice' },
    ]);
    expect(contactDeepLinks({ socials: { mastodon: 'https://fosstodon.org/@alice' } })).toEqual([
      { kind: 'mastodon', label: 'Mastodon', href: 'https://fosstodon.org/@alice' },
    ]);
  });
});

describe('profile pictures (#95)', () => {
  it('reads a GitHub username from a URL or a handle', () => {
    expect(githubUsername('https://github.com/aarav')).toBe('aarav');
    expect(githubUsername('github.com/aarav/')).toBe('aarav');
    expect(githubUsername('@aarav')).toBe('aarav');
    expect(githubUsername('https://github.com/orgs/fossunited')).toBeNull();
    expect(githubUsername('https://github.com/aarav/repo')).toBeNull();
    expect(githubAvatarUrl('https://github.com/aarav')).toBe(
      'https://github.com/aarav.png?size=160',
    );
  });

  it('prefers a stated picture, then GitHub, then a Gravatar the caller hashed', () => {
    expect(
      avatarUrlFor({
        avatarUrl: 'https://fossunited.org/files/aarav.jpg',
        socials: profile.socials,
      }),
    ).toBe('https://fossunited.org/files/aarav.jpg');
    expect(avatarUrlFor({ socials: profile.socials })).toBe(
      'https://github.com/aarav.png?size=160',
    );
    expect(avatarUrlFor({ socials: profile.socials }, { shareGithub: false })).toBeNull();
    expect(
      avatarUrlFor({ socials: {} }, { gravatarUrl: 'https://gravatar.com/avatar/abc?d=404' }),
    ).toBe('https://gravatar.com/avatar/abc?d=404');
    expect(avatarUrlFor({ avatarUrl: 'http://insecure.example/x.png', socials: {} })).toBeNull();
  });

  it('hashes the email for Gravatar with SHA-256 and asks for a blank on a miss', async () => {
    const url = await gravatarUrl('  Aarav@Example.org ');
    expect(url).toMatch(/^https:\/\/gravatar\.com\/avatar\/[0-9a-f]{64}\?s=160&d=404$/);
    expect(await gravatarUrl('not-an-email')).toBeNull();
  });

  it('puts a PHOTO link on the card only when it reveals nothing new', () => {
    // GitHub shared: the GitHub avatar rides along.
    const withGithub = attendeeProfileToVCard(profile);
    expect(withGithub).toContain('PHOTO;VALUE=URI:https://github.com/aarav.png?size=160');
    // GitHub switched off and nothing stated: no photo, even with a Gravatar at hand
    // while the email stays private.
    const noGithub: AttendeeShareSelection = {
      ...DEFAULT_ATTENDEE_SHARE_SELECTION,
      socials: { linkedin: true },
    };
    expect(
      attendeeProfileToVCard(profile, noGithub, { gravatarUrl: 'https://gravatar.com/avatar/x' }),
    ).not.toContain('PHOTO');
    // Email shared: the Gravatar is fine to carry.
    expect(
      attendeeProfileToVCard(
        profile,
        { ...noGithub, email: true },
        { gravatarUrl: 'https://gravatar.com/avatar/x' },
      ),
    ).toContain('PHOTO;VALUE=URI:https://gravatar.com/avatar/x');
    // The photo switch turns it off outright.
    expect(
      attendeeProfileToVCard(profile, { ...DEFAULT_ATTENDEE_SHARE_SELECTION, photo: false }),
    ).not.toContain('PHOTO');
  });
});

describe('FOSS United as a link (#96)', () => {
  it('classifies a profile URL and lists it with the other profiles', () => {
    expect(classifyLink('https://fossunited.org/u/aarav')).toBe('fossunited');
    expect(classifyLink('https://fossunited.org/indiafoss/2025')).toBe('website');
    const links = contactDeepLinks(profile);
    const fossu = links.find((l) => l.kind === 'fossunited');
    expect(fossu?.href).toBe('https://fossunited.org/u/aarav');
    expect(fossu?.label).toBe('FOSS United');
    // Ordered right after the personal site.
    expect(links.map((l) => l.kind).indexOf('fossunited')).toBeLessThan(
      links.map((l) => l.kind).indexOf('github'),
    );
  });
});
